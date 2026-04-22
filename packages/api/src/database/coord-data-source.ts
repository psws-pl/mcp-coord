import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { createCoordDataSourceOptions } from './coord-database.config';

export default new DataSource(createCoordDataSourceOptions());
