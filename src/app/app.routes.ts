import { Routes } from '@angular/router';

import {
  ActiveWorkContextGuard,
  DefaultStartPageGuard,
  DonatePageGuard,
  FocusOverlayOpenGuard,
  ValidProjectIdGuard,
  ValidTagIdGuard,
} from './app.guard';

import { TagTaskPageComponent } from './pages/tag-task-page/tag-task-page.component';

export const APP_ROUTES: Routes = [
  // Eagerly loaded — this is the main view
  {
    path: 'tag/:id/tasks',
    component: TagTaskPageComponent,
    data: { page: 'tag-tasks' },
    canActivate: [ValidTagIdGuard, FocusOverlayOpenGuard],
  },
  // Tag sub-routes (worklog, history, summary, metrics)
  // Must appear after tag/:id/tasks so the more specific path matches first
  {
    path: 'tag/:id',
    canActivate: [ValidTagIdGuard],
    canActivateChild: [FocusOverlayOpenGuard],
    loadChildren: () => import('./routes/context.routes').then((m) => m.TAG_CHILD_ROUTES),
  },
  // Project routes (tasks, worklog, history, summary, metrics)
  // Shares one chunk with tag routes via context.routes.ts
  {
    path: 'project/:id',
    canActivate: [ValidProjectIdGuard],
    canActivateChild: [FocusOverlayOpenGuard],
    loadChildren: () =>
      import('./routes/context.routes').then((m) => m.PROJECT_CHILD_ROUTES),
  },
  {
    path: 'folder/:folderId/metrics',
    loadComponent: () =>
      import('./pages/metric-page/metric-page.component').then(
        (m) => m.MetricPageComponent,
      ),
    data: { page: 'metrics' },
    canActivate: [FocusOverlayOpenGuard],
  },
  // Standalone pages — all import from same barrel so they share one chunk
  {
    path: 'config',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
    data: { page: 'config' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'sync-conflicts',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.SyncConflictsPageComponent),
    data: { page: 'sync-conflicts' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.SearchPageComponent),
    data: { page: 'search' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'scheduled-list',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ScheduledListPageComponent),
    data: { page: 'scheduled-list' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'planner',
    loadComponent: () => import('./routes/pages.routes').then((m) => m.PlannerComponent),
    data: { page: 'planner' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'schedule',
    loadComponent: () => import('./routes/pages.routes').then((m) => m.ScheduleComponent),
    data: { page: 'schedule' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'boards',
    loadComponent: () => import('./routes/pages.routes').then((m) => m.BoardsComponent),
    data: { page: 'boards' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'habits',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.HabitPageComponent),
    data: { page: 'habits' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.RpgProfileComponent),
    data: { page: 'profile' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'academy',
    loadComponent: () =>
      import('./features/academy-arcana/ui/academy-arcana-page.component').then(
        (m) => m.AcademyArcanaPageComponent,
      ),
    data: { page: 'academy' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'library',
    loadComponent: () =>
      import('./features/arcane-library/ui/arcane-library-page.component').then(
        (m) => m.ArcaneLibraryPageComponent,
      ),
    data: { page: 'library' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'games',
    loadComponent: () =>
      import('./features/game-library/ui/game-library-page.component').then(
        (m) => m.GameLibraryPageComponent,
      ),
    data: { page: 'games' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'nutrition',
    loadComponent: () =>
      import('./features/nutrition/ui/nutrition-page.component').then(
        (m) => m.NutritionPageComponent,
      ),
    data: { page: 'nutrition' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'archived-projects',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ArchivedProjectsPageComponent),
    data: { page: 'archived-projects' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'donate',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.DonatePageComponent),
    data: { page: 'donate' },
    canActivate: [DonatePageGuard, FocusOverlayOpenGuard],
  },
  {
    path: 'contrast-test',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ContrastTestComponent),
    data: { page: 'contrast-test' },
  },
  {
    path: 'plugins/:pluginId/index',
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.PluginIndexComponent),
    data: { page: 'plugin-index' },
    canActivate: [FocusOverlayOpenGuard],
  },
  {
    path: 'active/:subPageType',
    canActivate: [ActiveWorkContextGuard, FocusOverlayOpenGuard],
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
  },
  {
    path: 'active/:subPageType/:param',
    canActivate: [ActiveWorkContextGuard, FocusOverlayOpenGuard],
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
  },
  {
    path: 'active',
    canActivate: [ActiveWorkContextGuard, FocusOverlayOpenGuard],
    loadComponent: () =>
      import('./routes/pages.routes').then((m) => m.ConfigPageComponent),
  },
  // Wildcard — redirects to default start page
  {
    path: '**',
    canActivate: [DefaultStartPageGuard],
    component: TagTaskPageComponent,
  },
];
