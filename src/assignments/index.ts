import type { ComponentType } from 'react';
import { ConstellationPlot } from './week-01/ConstellationPlot';
import { DatasetSummary } from './week-02/DatasetSummary';

export interface Assignment {
  id: string;
  name: string;
  component: ComponentType;
}

export const assignments: Assignment[] = [
  {
    id: '1',
    name: 'Week 1',
    component: ConstellationPlot,
  },
  {
    id: '2',
    name: 'Week 2',
    component: DatasetSummary,
  },
];

export const assignmentsMap = new Map(assignments.map((ex) => [ex.id, ex]));

export const defaultAssignment = '2';
