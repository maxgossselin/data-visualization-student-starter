import type { ComponentType } from 'react';
import { ConstellationPlot } from './week-01/ConstellationPlot';
import { DatasetSummary } from './week-02/DatasetSummary';
import { AgeFamilyScatter } from './week-03/AgeFamilyScatter';
import { AgeFamilySizePlot } from './week-04/AgeFamilySizePlot';

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
  {
    id: '3',
    name: 'Week 3',
    component: AgeFamilyScatter,
  },
  {
    id: '4',
    name: 'Week 4',
    component: AgeFamilySizePlot,
  },
];

export const assignmentsMap = new Map(assignments.map((ex) => [ex.id, ex]));

export const defaultAssignment = '4';
