import { Command } from "../command";
import { commandDecorator as createVariableGroupCommandDecorator } from "./create-variable-group";
import { commandDecorator as initCommandDecorator } from "./init";
import { commandDecorator as pipelineCommandDecorator } from "./pipeline";

export const projectCommand = Command(
  "project",
  "Initialize and manage your Bedrock project.",
  [
    createVariableGroupCommandDecorator,
    pipelineCommandDecorator,
    initCommandDecorator
  ]
);
