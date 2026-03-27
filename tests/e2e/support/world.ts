/**
 * Cucumber World -- shared state across steps within a single scenario.
 */

import { World, setWorldConstructor } from "@cucumber/cucumber";
import type { PluginResult } from "../harness/plugin-runner.js";

export class AegisWorld extends World {
  /** Most recent plugin invocation result. */
  pluginResult?: PluginResult;

  /** Input JSON string for the current scenario. */
  input?: string;

  /** Extra args to pass to the plugin (e.g., --confirm-destroy). */
  extraArgs: string[] = [];

  /** Whether boundary has been provisioned in this scenario. */
  provisioned = false;
}

setWorldConstructor(AegisWorld);
