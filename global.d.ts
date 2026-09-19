import en from "./messages/en.json";

// Makes a wrong or missing message key a type error, checked against the English file.
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
  }
}
