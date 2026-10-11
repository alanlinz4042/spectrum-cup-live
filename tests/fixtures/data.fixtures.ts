// Data fixtures: the sample data.json and a route helper that serves a payload in place of docs/data.json.
import { test as base, type Page } from '@playwright/test';
import { FixtureData } from '../support/FixtureData';

export interface ServedData {
  /** URLs the page requested for data.json, in order. */
  readonly urls: string[];
  /** Replace the payload served on the next poll. */
  set(payload: unknown): void;
}

export const test = base.extend<{ data: FixtureData; serveData: (initial: unknown) => Promise<ServedData> }>({
  data: async ({}, use) => {
    await use(new FixtureData());
  },
  serveData: async ({ page }, use) => {
    await use(async (initial: unknown) => {
      let body = JSON.stringify(initial);
      const urls: string[] = [];
      await (page as Page).route('**/data.json*', (route) => {
        urls.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body });
      });
      return {
        urls,
        set(payload: unknown) {
          body = JSON.stringify(payload);
        },
      };
    });
  },
});
