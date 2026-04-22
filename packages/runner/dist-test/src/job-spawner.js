"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobSpawner = void 0;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
/**
 * Thin k8s abstraction for the runner.
 *
 * ar-004 owns the low-level Job lifecycle primitives only:
 *   - submitJob()
 *   - watchJob()
 *   - cleanupJob()
 *
 * ar-005 can compose these primitives into task orchestration, driver execution,
 * and result reporting without reaching into the Kubernetes SDK directly.
 */
class JobSpawner {
    options;
    deps;
    constructor(options, deps) {
        this.options = options;
        this.deps = deps;
    }
    static async create(options) {
        const resolved = {
            namespace: options.namespace,
            kubeconfig: options.kubeconfig,
            pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        };
        const k8s = await loadKubernetesModule();
        const kubeConfig = new k8s.KubeConfig();
        if (resolved.kubeconfig) {
            kubeConfig.loadFromFile(resolved.kubeconfig);
        }
        else {
            kubeConfig.loadFromCluster();
        }
        return new JobSpawner(resolved, {
            batchApi: kubeConfig.makeApiClient(k8s.BatchV1Api),
            coreApi: kubeConfig.makeApiClient(k8s.CoreV1Api),
        });
    }
    static async fromConfig(config, overrides) {
        return JobSpawner.create({
            namespace: config.namespace,
            kubeconfig: config.kubeconfig,
            pollIntervalMs: overrides?.pollIntervalMs,
        });
    }
    static fromClients(options, deps) {
        return new JobSpawner({
            namespace: options.namespace,
            kubeconfig: options.kubeconfig,
            pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        }, deps);
    }
    async submitJob(spec) {
        const name = spec.metadata?.name;
        if (!name) {
            throw new Error('[runner] Job spec is missing metadata.name');
        }
        const prepared = this.prepareJobSpec(spec);
        return this.deps.batchApi.createNamespacedJob({
            namespace: this.options.namespace,
            body: prepared,
        });
    }
    async watchJob(name, options = {}) {
        const timeoutAt = options.timeoutMs === undefined ? undefined : Date.now() + options.timeoutMs;
        const pollIntervalMs = options.pollIntervalMs ?? this.options.pollIntervalMs;
        let lastFingerprint;
        while (true) {
            const observation = await this.observeJob(name);
            const fingerprint = JSON.stringify({
                phase: observation.update.phase,
                status: observation.update.status,
                pods: observation.update.pods,
            });
            if (fingerprint !== lastFingerprint) {
                lastFingerprint = fingerprint;
                await options.onUpdate?.(observation.update);
            }
            if (observation.update.terminal) {
                return {
                    jobName: name,
                    namespace: this.options.namespace,
                    final: observation.update,
                    logs: await this.collectLogs(observation.pods, options),
                };
            }
            if (timeoutAt !== undefined && Date.now() >= timeoutAt) {
                throw new Error(`[runner] Timed out waiting for Job ${this.options.namespace}/${name}`);
            }
            await sleep(pollIntervalMs);
        }
    }
    async cleanupJob(name) {
        await this.deps.batchApi.deleteNamespacedJob({
            name,
            namespace: this.options.namespace,
            propagationPolicy: 'Background',
        });
    }
    prepareJobSpec(spec) {
        return {
            ...spec,
            metadata: {
                ...spec.metadata,
                namespace: this.options.namespace,
            },
        };
    }
    async observeJob(name) {
        const job = await this.deps.batchApi.readNamespacedJobStatus({
            name,
            namespace: this.options.namespace,
        });
        const pods = await this.listPodsForJob(name);
        const status = job.status;
        const update = {
            jobName: name,
            namespace: this.options.namespace,
            phase: deriveJobPhase(status, pods),
            terminal: false,
            observedAt: new Date().toISOString(),
            status: mapJobStatus(status),
            pods: pods.map(mapPod),
        };
        update.terminal =
            update.phase === 'succeeded' || update.phase === 'failed';
        return { update, pods };
    }
    async listPodsForJob(name) {
        const podList = await this.deps.coreApi.listNamespacedPod({
            namespace: this.options.namespace,
            labelSelector: `job-name=${name}`,
        });
        return podList.items ?? [];
    }
    async collectLogs(pods, options) {
        const logs = [];
        for (const pod of pods) {
            const podName = pod.metadata?.name;
            if (!podName)
                continue;
            const initStatuses = toStatusMap(pod.status?.initContainerStatuses);
            for (const container of pod.spec?.initContainers ?? []) {
                logs.push(...(await this.collectContainerLogs(podName, container.name, 'init', initStatuses.get(container.name), options)));
            }
            const mainStatuses = toStatusMap(pod.status?.containerStatuses);
            for (const container of pod.spec?.containers ?? []) {
                logs.push(...(await this.collectContainerLogs(podName, container.name, 'main', mainStatuses.get(container.name), options)));
            }
        }
        return logs;
    }
    async collectContainerLogs(podName, containerName, containerType, containerStatus, options) {
        const logs = [];
        logs.push(await this.readContainerLog(podName, containerName, containerType, false, options.logTailLines));
        if ((options.includePreviousLogs ?? true) &&
            (containerStatus?.restartCount ?? 0) > 0) {
            logs.push(await this.readContainerLog(podName, containerName, containerType, true, options.logTailLines));
        }
        return logs;
    }
    async readContainerLog(podName, containerName, containerType, previous, tailLines) {
        try {
            const content = await this.deps.coreApi.readNamespacedPodLog({
                name: podName,
                namespace: this.options.namespace,
                container: containerName,
                previous,
                tailLines,
            });
            return {
                podName,
                containerName,
                containerType,
                previous,
                content,
            };
        }
        catch (error) {
            return {
                podName,
                containerName,
                containerType,
                previous,
                content: '',
                error: formatError(error),
            };
        }
    }
}
exports.JobSpawner = JobSpawner;
async function loadKubernetesModule() {
    return importModule('@kubernetes/client-node');
}
function importModule(specifier) {
    return Function('specifier', 'return import(specifier)')(specifier);
}
function deriveJobPhase(status, pods) {
    if (hasCondition(status?.conditions, 'Failed')) {
        return 'failed';
    }
    if (hasCondition(status?.conditions, 'Complete')) {
        return 'succeeded';
    }
    const podPhases = pods.map((pod) => pod.status?.phase).filter(Boolean);
    if (podPhases.includes('Running')) {
        return 'running';
    }
    if (podPhases.includes('Pending')) {
        return 'pending';
    }
    if ((status?.active ?? 0) > 0) {
        return 'running';
    }
    if ((status?.succeeded ?? 0) > 0 && (status?.active ?? 0) === 0) {
        return 'succeeded';
    }
    if (status?.startTime) {
        return 'running';
    }
    if (pods.length > 0) {
        return 'unknown';
    }
    return 'pending';
}
function hasCondition(conditions, expectedType) {
    return (conditions?.some((condition) => condition.type === expectedType && condition.status === 'True') ?? false);
}
function mapJobStatus(status) {
    return {
        active: status?.active ?? 0,
        succeeded: status?.succeeded ?? 0,
        failed: status?.failed ?? 0,
        ready: status?.ready ?? 0,
        startTime: toIsoString(status?.startTime),
        completionTime: toIsoString(status?.completionTime),
        conditions: (status?.conditions ?? []).map(mapCondition),
    };
}
function mapCondition(condition) {
    return {
        type: condition.type,
        status: condition.status,
        reason: condition.reason,
        message: condition.message,
        lastProbeTime: toIsoString(condition.lastProbeTime),
        lastTransitionTime: toIsoString(condition.lastTransitionTime),
    };
}
function mapPod(pod) {
    return {
        name: pod.metadata?.name ?? 'unknown',
        phase: pod.status?.phase,
        reason: pod.status?.reason,
        message: pod.status?.message,
        startTime: toIsoString(pod.status?.startTime),
        podIP: pod.status?.podIP,
        hostIP: pod.status?.hostIP,
        initContainers: mapContainerStatuses(pod.spec?.initContainers?.map((container) => ({
            name: container.name,
            image: container.image,
        })) ?? [], pod.status?.initContainerStatuses),
        containers: mapContainerStatuses(pod.spec?.containers?.map((container) => ({
            name: container.name,
            image: container.image,
        })) ?? [], pod.status?.containerStatuses),
    };
}
function mapContainerStatuses(declaredContainers, statuses) {
    const statusMap = toStatusMap(statuses);
    return declaredContainers.map((container) => mapContainerStatus(container.name, container.image, statusMap.get(container.name)));
}
function mapContainerStatus(name, image, status) {
    const details = extractContainerState(status?.state);
    return {
        name,
        image,
        ready: status?.ready ?? false,
        restartCount: status?.restartCount ?? 0,
        ...details,
    };
}
function extractContainerState(state) {
    if (state?.terminated) {
        return {
            state: 'terminated',
            reason: state.terminated.reason,
            message: state.terminated.message,
            exitCode: state.terminated.exitCode,
            startedAt: toIsoString(state.terminated.startedAt),
            finishedAt: toIsoString(state.terminated.finishedAt),
        };
    }
    if (state?.running) {
        return {
            state: 'running',
            startedAt: toIsoString(state.running.startedAt),
        };
    }
    if (state?.waiting) {
        return {
            state: 'waiting',
            reason: state.waiting.reason,
            message: state.waiting.message,
        };
    }
    return {
        state: 'unknown',
    };
}
function toStatusMap(statuses) {
    return new Map((statuses ?? []).map((status) => [status.name, status]));
}
function toIsoString(value) {
    if (!value)
        return undefined;
    return value instanceof Date ? value.toISOString() : value;
}
function formatError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=job-spawner.js.map