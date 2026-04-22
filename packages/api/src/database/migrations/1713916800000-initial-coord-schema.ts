import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  COORD_AGENT_STATUSES,
  COORD_MESSAGE_STATUSES,
  COORD_MESSAGE_TYPES,
  COORD_PLAN_STATUSES,
  COORD_TASK_PRIORITIES,
  COORD_TASK_STATUSES,
} from '../coord-schema.constants';

const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

export class InitialCoordSchema1713916800000 implements MigrationInterface {
  public readonly name = 'InitialCoordSchema1713916800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "coord_plans" (
        "id" character varying NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "status" character varying NOT NULL DEFAULT 'draft',
        "owner" character varying NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coord_plans_id" PRIMARY KEY ("id"),
        CONSTRAINT "coord_plans_status_check" CHECK ("status" IN (${sqlList(COORD_PLAN_STATUSES)}))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coord_tasks" (
        "id" character varying NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "status" character varying NOT NULL DEFAULT 'pending',
        "priority" character varying NOT NULL DEFAULT 'P2',
        "owner" character varying NOT NULL,
        "plan_id" character varying,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coord_tasks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coord_tasks_plan_id" FOREIGN KEY ("plan_id") REFERENCES "coord_plans"("id") ON DELETE SET NULL,
        CONSTRAINT "coord_tasks_status_check" CHECK ("status" IN (${sqlList(COORD_TASK_STATUSES)})),
        CONSTRAINT "coord_tasks_priority_check" CHECK ("priority" IN (${sqlList(COORD_TASK_PRIORITIES)}))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coord_agents" (
        "id" character varying NOT NULL,
        "name" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'waiting',
        "enabled" boolean NOT NULL DEFAULT true,
        "driver" character varying,
        "capabilities" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "current_task_id" character varying,
        "last_heartbeat_at" TIMESTAMPTZ,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coord_agents_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_coord_agents_name" UNIQUE ("name"),
        CONSTRAINT "FK_coord_agents_current_task_id" FOREIGN KEY ("current_task_id") REFERENCES "coord_tasks"("id") ON DELETE SET NULL,
        CONSTRAINT "coord_agents_status_check" CHECK ("status" IN (${sqlList(COORD_AGENT_STATUSES)}))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coord_messages" (
        "id" character varying NOT NULL,
        "from" character varying NOT NULL,
        "to" character varying NOT NULL,
        "type" character varying NOT NULL,
        "body" text NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "task_id" character varying,
        "plan_id" character varying,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "acknowledged_at" TIMESTAMPTZ,
        CONSTRAINT "PK_coord_messages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coord_messages_task_id" FOREIGN KEY ("task_id") REFERENCES "coord_tasks"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_coord_messages_plan_id" FOREIGN KEY ("plan_id") REFERENCES "coord_plans"("id") ON DELETE SET NULL,
        CONSTRAINT "coord_messages_status_check" CHECK ("status" IN (${sqlList(COORD_MESSAGE_STATUSES)})),
        CONSTRAINT "coord_messages_type_check" CHECK ("type" IN (${sqlList(COORD_MESSAGE_TYPES)}))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "coord_plans_status_idx"
      ON "coord_plans" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_plans_owner_idx"
      ON "coord_plans" ("owner")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_tasks_status_idx"
      ON "coord_tasks" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_tasks_owner_idx"
      ON "coord_tasks" ("owner")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_tasks_plan_id_idx"
      ON "coord_tasks" ("plan_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_tasks_status_owner_idx"
      ON "coord_tasks" ("status", "owner")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_agents_status_idx"
      ON "coord_agents" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_agents_enabled_idx"
      ON "coord_agents" ("enabled")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_agents_current_task_id_idx"
      ON "coord_agents" ("current_task_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_messages_to_status_created_at_idx"
      ON "coord_messages" ("to", "status", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_messages_from_created_at_idx"
      ON "coord_messages" ("from", "created_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_messages_task_id_idx"
      ON "coord_messages" ("task_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "coord_messages_plan_id_idx"
      ON "coord_messages" ("plan_id")
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "coord_set_updated_at"()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updated_at" = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER "coord_plans_set_updated_at"
      BEFORE UPDATE ON "coord_plans"
      FOR EACH ROW
      EXECUTE FUNCTION "coord_set_updated_at"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "coord_tasks_set_updated_at"
      BEFORE UPDATE ON "coord_tasks"
      FOR EACH ROW
      EXECUTE FUNCTION "coord_set_updated_at"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "coord_agents_set_updated_at"
      BEFORE UPDATE ON "coord_agents"
      FOR EACH ROW
      EXECUTE FUNCTION "coord_set_updated_at"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "coord_messages_set_updated_at"
      BEFORE UPDATE ON "coord_messages"
      FOR EACH ROW
      EXECUTE FUNCTION "coord_set_updated_at"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "coord_messages_set_updated_at" ON "coord_messages"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "coord_agents_set_updated_at" ON "coord_agents"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "coord_tasks_set_updated_at" ON "coord_tasks"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "coord_plans_set_updated_at" ON "coord_plans"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "coord_set_updated_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coord_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coord_agents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coord_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "coord_plans"`);
  }
}
