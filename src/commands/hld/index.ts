import { Command } from "../command";
import { commandDecorator as initCommandDecorator } from "./init";
import { commandDecorator as pipelineCommandDecorator } from "./pipeline";
import { reconcileHldDecorator } from "./reconcile";

export const hldCommand = Command(
  "hld",
  "Commands for initalizing and managing a bedrock HLD repository.",
  [initCommandDecorator, pipelineCommandDecorator, reconcileHldDecorator]
);
