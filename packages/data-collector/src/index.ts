// Pipeline
export { CollectionPipeline } from "./pipeline.js";
export type { PipelineResult } from "./pipeline.js";

// Base task interface
export type { TaskContext, CollectionTask } from "./tasks/base-task.js";

// Individual tasks
export { GoogleSearchTask } from "./tasks/google-search-task.js";
export { CorporateSiteTask } from "./tasks/corporate-site-task.js";
export { RecruitmentTask } from "./tasks/recruitment-task.js";
export { GbizInfoTask } from "./tasks/gbizinfo-task.js";
export { IrReportTask } from "./tasks/ir-report-task.js";
export { PressReleaseTask } from "./tasks/press-release-task.js";
export { MediaTask } from "./tasks/media-task.js";
export { CompetitorTask } from "./tasks/competitor-task.js";
export { ContactSearchTask } from "./tasks/contact-search-task.js";
