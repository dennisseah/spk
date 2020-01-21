import commander from "commander";
import path from "path";
import shelljs from "shelljs";
import { BedrockAsync } from "../../config";
import { build } from "../../lib/commandBuilder";
import {
  addNewServiceToBedrockFile,
  addNewServiceToMaintainersFile,
  generateDockerfile,
  generateGitIgnoreFile,
  generateStarterAzurePipelinesYaml
} from "../../lib/fileutils";
import { checkoutCommitPushCreatePRLink } from "../../lib/gitutils";
import { logger } from "../../logger";
import { IBedrockFile, IHelmConfig, IUser } from "../../types";
import decorator from "./create.decorator.json";

// values that we need to pull out from command operator
export interface ICommandOptions {
  [key: string]: string;
}

// all these values are sure to be string because
// their default values are set to "". see `create.decorator.json`
// except for variableGroupName which values are set in the code
// later
const fetchValues = (opts: ICommandOptions): ICommandOptions => {
  return {
    displayName: opts.displayName,
    helmChartChart: opts.helmChartChart,
    helmChartRepository: opts.helmChartRepository,
    helmConfigBranch: opts.helmConfigBranch,
    helmConfigGit: opts.helmConfigGit,
    helmConfigPath: opts.helmConfigPath,
    maintainerEmail: opts.maintainerEmail,
    maintainerName: opts.maintainerName,
    middlewares: opts.middlewares,
    packagesDir: opts.packagesDir
  };
};

const computeVariableGroupsValue = (
  opts: ICommandOptions,
  bedrock: IBedrockFile
): string[] => {
  let variableGroupName = "";

  // fall back to bedrock.yaml when <variable-group-name> argument is not specified; default to empty string
  if (opts.variableGroupName === undefined) {
    if (bedrock.variableGroups && bedrock.variableGroups.length > 0) {
      variableGroupName = bedrock.variableGroups[0];
    }
  } else {
    variableGroupName = opts.variableGroupName;
  }
  return variableGroupName.length > 0 ? [variableGroupName] : [];
};

const execute = async (serviceName: string, opts: ICommandOptions) => {
  const projectPath = process.cwd();

  try {
    const bedrock = await BedrockAsync();
    const values = fetchValues(opts);

    const variableGroups = computeVariableGroupsValue(opts, bedrock);
    const middlewares = values.middlewares
      ? values.middlewares.split(",").map(str => str.trim())
      : [];

    const gitPush = !!opts.gitPush;
    await createService(
      projectPath,
      serviceName,
      values,
      gitPush,
      middlewares,
      variableGroups
    );
    process.exit(0);
  } catch (err) {
    logger.error(
      `Error occurred adding service ${serviceName} to project ${projectPath}`
    );
    logger.error(err);
    process.exit(1);
  }
};

export const commandDecorator = (command: commander.Command) => {
  build(command, decorator).action(execute);
};

/**
 * Creates a service in a bedrock project directory.
 *
 * @param rootProjectPath Project root path
 * @param serviceName Service Name
 * @param values Values from the command line
 * @param gitPush true to push to git
 * @param middlewares Array of middlewares
 * @param variableGroups Array of variable groups
 */
export const createService = async (
  rootProjectPath: string,
  serviceName: string,
  values: ICommandOptions,
  gitPush: boolean,
  middlewares?: string[],
  variableGroups?: string[]
) => {
  logger.info(
    `Adding Service: ${serviceName}, to Project: ${rootProjectPath} under directory: ${values.packagesDir}`
  );
  logger.info(
    `DisplayName: ${values.displayName}, MaintainerName: ${values.maintainerName}, MaintainerEmail: ${values.maintainerEmail}`
  );

  const newServiceDir = path.join(
    rootProjectPath,
    values.packagesDir || "",
    serviceName
  );
  logger.info(`servicePath: ${newServiceDir}`);

  // Mkdir
  shelljs.mkdir("-p", newServiceDir);

  // Create azure pipelines yaml in directory
  await generateStarterAzurePipelinesYaml(rootProjectPath, newServiceDir, {
    variableGroups
  });

  // Create empty .gitignore file in directory
  generateGitIgnoreFile(newServiceDir, "");

  // Create simple Dockerfile in directory
  generateDockerfile(newServiceDir);

  // add maintainers to file in parent repo file
  const newUser = {
    email: values.maintainerEmail || "",
    name: values.maintainerName || ""
  } as IUser;

  const newServiceRelativeDir = path.relative(rootProjectPath, newServiceDir);
  logger.debug(`newServiceRelPath: ${newServiceRelativeDir}`);

  addNewServiceToMaintainersFile(
    path.join(rootProjectPath, "maintainers.yaml"),
    newServiceRelativeDir,
    [newUser]
  );

  // Add relevant bedrock info to parent bedrock.yaml

  let helmConfig: IHelmConfig;
  if (values.helmChartChart && values.helmChartRepository) {
    helmConfig = {
      chart: {
        chart: values.helmChartChart,
        repository: values.helmChartRepository
      }
    };
  } else {
    helmConfig = {
      chart: {
        branch: values.helmConfigBranch || "",
        git: values.helmConfigGit || "",
        path: values.helmConfigPath || ""
      }
    };
  }

  addNewServiceToBedrockFile(
    path.join(rootProjectPath, "bedrock.yaml"),
    newServiceRelativeDir,
    values.displayName || "",
    helmConfig,
    middlewares
  );

  // If requested, create new git branch, commit, and push
  if (gitPush) {
    await checkoutCommitPushCreatePRLink(
      serviceName,
      newServiceDir,
      path.join(rootProjectPath, "bedrock.yaml"),
      path.join(rootProjectPath, "maintainers.yaml")
    );
  }
};
