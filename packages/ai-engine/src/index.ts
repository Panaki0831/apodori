export { LlmClient } from "./llm-client.js";
export type { LlmClientConfig } from "./llm-client.js";

export {
  EXTRACT_COMPANY_INFO,
  FIND_CONTACT_PERSON,
  ESTIMATE_EMAIL_PATTERN,
  ANALYZE_COMPANY,
  EXTRACT_RECRUITMENT_INFO,
  EXTRACT_NEWS,
} from "./prompts/index.js";
export type { PromptTemplate } from "./prompts/index.js";

export {
  extractCompanyInfo,
  extractContacts,
  extractRecruitmentInfo,
  extractNews,
  analyzeCompany,
} from "./extractor.js";
