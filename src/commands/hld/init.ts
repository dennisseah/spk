import commander from "commander";

import { build } from "../../lib/commandBuilder";
import {
  generateDefaultHldComponentYaml,
  generateGitIgnoreFile,
  generateHldAzurePipelinesYaml
} from "../../lib/fileutils";
import { checkoutCommitPushCreatePRLink } from "../../lib/gitutils";
import { logger } from "../../logger";
import decorator from "./init.decorator.json";

// values that we need to pull out from command operator
interface ICommandOptions {
  gitPush: boolean | undefined;
}

const execute = async (opts: ICommandOptions) => {
  const { gitPush = false } = opts;
  // gitPath will always be boolean type, this is enforced by commander.
  const projectPath = process.cwd();

  try {
    await initialize(projectPath, gitPush);
  } catch (err) {
    logger.error(
      `Error occurred while initializing hld repository ${projectPath}`
    );
    logger.error(err);
  }
};

export const commandDecorator = (command: commander.Command): void => {
  build(command, decorator).action(execute);
};

export const initialize = async (rootProjectPath: string, gitPush: boolean) => {
  // Create azure-pipelines.yaml for hld repository, if required.
  logger.info("Initializing bedrock HLD repository.");

  generateHldAzurePipelinesYaml(rootProjectPath);
  generateDefaultHldComponentYaml(rootProjectPath);
  // Create .gitignore file in directory ignoring spk.log, if one doesn't already exist.
  generateGitIgnoreFile(rootProjectPath, "spk.log");

  // If requested, create new git branch, commit, and push
  if (gitPush) {
    const newBranchName = "spk-hld-init";
    const directory = ".";
    await checkoutCommitPushCreatePRLink(newBranchName, directory);
  }
};
