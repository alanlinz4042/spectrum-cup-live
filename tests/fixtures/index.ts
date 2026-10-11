// Composes all fixtures. Specs import `test` and `expect` from here and nowhere else.
import { mergeTests, expect } from '@playwright/test';
import { test as pagesTest } from './pages.fixtures';
import { test as dataTest } from './data.fixtures';

export const test = mergeTests(pagesTest, dataTest);
export { expect };
