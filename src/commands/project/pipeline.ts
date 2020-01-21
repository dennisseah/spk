import { IBuildApi } from "azure-devops-node-api/BuildApi";
import {
  BuildDefinition,
  BuildDefinitionVariable
} from "azure-devops-node-api/interfaces/BuildInterfaces";
import commander from "commander";
import { Config } from "../../config";
import { build, validateForRequiredValues } from "../../lib/commandBuilder";
import { BUILD_SCRIPT_URL } from "../../lib/constants";
import {
  getOriginUrl,
  getRepositoryName,
  getRepositoryUrl
} from "../../lib/gitutils";
import {
  createPipelineForDefinition,
  definitionForAzureRepoPipeline,
  getBuildApiClient,
  queueBuild
} from "../../lib/pipelines/pipelines";
import { logger } from "../../logger";
import decorator from "./pipeline.decorator.json";

// values that we need to pull out from command operator
export interface ICommandOptions {
  [key: string]: string | undefined;
}

const fetchValues = async (opts: ICommandOptions): Promise<ICommandOptions> => {
  const gitOriginUrl = await getOriginUrl();
  const { azure_devops } = Config();

  const {
    orgName = azure_devops && azure_devops.org,
    personalAccessToken = azure_devops && azure_devops.access_token,
    devopsProject = azure_devops && azure_devops.project,
    pipelineName = getRepositoryName(gitOriginUrl) + "-lifecycle",
    repoName = getRepositoryName(gitOriginUrl),
    repoUrl = getRepositoryUrl(gitOriginUrl),
    hldUrl = azure_devops && azure_devops.hld_repository,
    buildScriptUrl = BUILD_SCRIPT_URL
  } = opts;

  return {
    buildScriptUrl,
    devopsProject,
    hldUrl,
    orgName,
    personalAccessToken,
    pipelineName,
    repoName,
    repoUrl
  };
};

export const validateValues = (values: ICommandOptions) => {
  return validateForRequiredValues(decorator, values);
};

const execute = async (opts: ICommandOptions) => {
  const values = await fetchValues(opts);
  const errors = validateValues(values);
  if (errors.length > 0) {
    process.exit(1);
  }

  try {
    await installLifecyclePipeline(values, process.exit);
  } catch (err) {
    logger.error(
      `Error occurred installing pipeline for HLD to Manifest pipeline`
    );
    logger.error(err);
    process.exit(1);
  }
};

export const commandDecorator = (command: commander.Command): void => {
  build(command, decorator).action(execute);
};

const fetchBuildApiClient = async (
  values: ICommandOptions
): Promise<IBuildApi> => {
  try {
    const client = await getBuildApiClient(
      values.orgName!,
      values.personalAccessToken!
    );
    logger.info("Fetched DevOps Client");
    return client;
  } catch (err) {
    logger.error(err);
    // rethrow error; and it is caught by caller
    // this is to print more precise error log.
    throw err;
  }
};

const createPipeline = async (
  devopsClient: IBuildApi,
  values: ICommandOptions
): Promise<BuildDefinition> => {
  try {
    const definition = definitionForAzureRepoPipeline({
      branchFilters: ["master"],
      maximumConcurrentBuilds: 1,
      pipelineName: values.pipelineName!,
      repositoryName: values.repoName!,
      repositoryUrl: values.repoUrl!,
      variables: requiredPipelineVariables(
        values.personalAccessToken!,
        values.buildScriptUrl!,
        values.hldUrl!
      ),
      yamlFileBranch: "master",
      yamlFilePath: "hld-lifecycle.yaml"
    });

    logger.debug(
      `Creating pipeline for project '${
        values.devopsProject
      }' with definition '${JSON.stringify(definition)}'`
    );
    const builtDefinition = await createPipelineForDefinition(
      devopsClient!,
      values.devopsProject!,
      definition
    );

    if (typeof builtDefinition.id === "undefined") {
      const builtDefnString = JSON.stringify(builtDefinition);
      throw Error(
        `Invalid BuildDefinition created, parameter 'id' is missing from ${builtDefnString}`
      );
    }

    logger.info(`Created pipeline for ${values.pipelineName}`);
    logger.info(`Pipeline ID: ${builtDefinition.id}`);

    return builtDefinition;
  } catch (err) {
    logger.error(
      `Error occurred during pipeline creation for ${values.pipelineName}`
    );
    logger.error(err);
    // rethrow error; and it is caught by caller
    // this is to print more precise error log.
    throw err;
  }
};

/**
 * Install the project hld lifecycle pipeline in an azure devops org.
 *
 * @param values Values from command line.
 * @param exitFn
 */
export const installLifecyclePipeline = async (
  values: ICommandOptions,
  exitFn: (status: number) => void
) => {
  try {
    const devopsClient = await fetchBuildApiClient(values);
    const builtDefinition = await createPipeline(devopsClient, values);

    try {
      await queueBuild(
        devopsClient,
        values.devopsProject!,
        builtDefinition.id!
      );
    } catch (err) {
      logger.error(
        `Error occurred when queueing build for ${values.pipelineName}`
      );
      logger.error(err);
      // rethrow error; and it is caught by outer catch block,
      // this is to print more precise error log.
      throw err;
    }
  } catch (_) {
    exitFn(1);
  }
};

/**
 * Builds and returns variables required for the lifecycle pipeline.
 * @param accessToken Access token with access to the HLD repository.
 * @param buildScriptUrl Build Script URL
 * @param hldRepoUrl to the HLD repository.
 * @returns Object containing the necessary run-time variables for the lifecycle pipeline.
 */
export const requiredPipelineVariables = (
  accessToken: string,
  buildScriptUrl: string,
  hldRepoUrl: string
): { [key: string]: BuildDefinitionVariable } => {
  return {
    BUILD_SCRIPT_URL: {
      allowOverride: true,
      isSecret: false,
      value: buildScriptUrl
    },
    HLD_REPO: {
      allowOverride: true,
      isSecret: false,
      value: hldRepoUrl
    },
    PAT: {
      allowOverride: true,
      isSecret: true,
      value: accessToken
    }
  };
};
