import { test, runIfMain } from "./vendor/https/deno.land/std/testing/mod.ts";
import {
  assertEquals,
  assertThrows
} from "./vendor/https/deno.land/std/testing/asserts.ts";
import { upgradePatchVersion } from "./util.ts";

test("upgradePatchVersion", () => {
  assertEquals(upgradePatchVersion("v0.1.0"), "v0.1.1");
  assertEquals(upgradePatchVersion("0.1.0"), "0.1.1");
  assertEquals(upgradePatchVersion("v3.11.110"), "v3.11.111");
  assertEquals(upgradePatchVersion("3.11.110"), "3.11.111");
  assertThrows(() => {
    upgradePatchVersion("v0.1.");
  });
  assertThrows(() => {
    upgradePatchVersion("v0.1");
  });
});

runIfMain(import.meta);
