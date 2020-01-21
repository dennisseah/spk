import { IBuildApi } from "azure-devops-node-api/BuildApi";
import { Build } from "azure-devops-node-api/interfaces/BuildInterfaces";
import {
  BuildDefinition,
  BuildDefinitionVariable
} from "azure-devops-node-api/interfaces/BuildInterfaces";
import commander from "commander";
import { Config } from "../../config";
import { build, validateForRequiredValues } from "../../lib/commandBuilder";
import { BUILD_SCRIPT_URL } from "../../lib/constants";
import { getRepositoryName } from "../../lib/gitutils";
import {
  createPipelineForDefinition,
  definitionForAzureRepoPipeline,
  getBuildApiClient,
  IAzureRepoPipelineConfig,
  queueBuild
} from "../../lib/pipelines/pipelines";
import { logger } from "../../logger";
import decorator from "./pipeline.decorator.json";

export interface ICommandOptions {
  [key: string]: string | undefined;
}

const fetchValues = (opts: ICommandOptions): ICommandOptions => {
  const { azure_devops } = Config();

  const {
    hldUrl = azure_devops?.hld_repository,
    manifestUrl = azure_devops?.manifest_repository
  } = opts;

  const {
    orgName = azure_devops?.org,
    personalAccessToken = azure_devops?.access_token,
    devopsProject = azure_devops?.project,
    hldName = getRepositoryName(hldUrl || ""),
    pipelineName = hldName + "-to-" + getRepositoryName(manifestUrl || ""),
    buildScriptUrl = BUILD_SCRIPT_URL
  } = opts;

  return {
    buildScriptUrl,
    devopsProject,
    hldName,
    hldUrl,
    manifestUrl,
    orgName,
    personalAccessToken,
    pipelineName
  };
};

export const validateValues = (values: ICommandOptions) => {
  return validateForRequiredValues(decorator, values);
};

const execute = async (opts: ICommandOptions) => {
  try {
    const values = fetchValues(opts);
    const errors = validateValues(values);

    if (errors.length > 0) {
      process.exit(1);
    }

    await installHldToManifestPipeline(values, process.exit);
  } catch (err) {
    logger.error(
      `Error occurred installing pipeline for HLD to Manifest pipeline`
    );
    logger.error(err);
    process.exit(1);
  }
};

export const commandDecorator = (command: commander.Command) => {
  build(command, decorator).action(execute);
};

const fetchBuildAPIClient = async (
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
  client: IBuildApi,
  values: ICommandOptions
): Promise<BuildDefinition> => {
  try {
    const definition = definitionForAzureRepoPipeline({
      branchFilters: ["master"],
      maximumConcurrentBuilds: 1,
      pipelineName: values.pipelineName!,
      repositoryName: values.hldName!,
      repositoryUrl: values.hldUrl!,
      variables: requiredPipelineVariables(
        values.personalAccessToken!,
        values.buildScriptUrl!,
        values.manifestUrl!
      ),
      yamlFileBranch: "master",
      yamlFilePath: `manifest-generation.yaml`
    } as IAzureRepoPipelineConfig);

    const defn = await createPipelineForDefinition(
      client,
      values.devopsProject!,
      definition
    );
    logger.info(`Created pipeline for ${values.pipelineName}`);
    logger.info(`Pipeline ID: ${defn.id}`);
    return defn;
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

const buildQueue = async (
  client: IBuildApi,
  project: string,
  pipelineName: string,
  builtDefinition: BuildDefinition
): Promise<Build> => {
  try {
    return await queueBuild(client, project, builtDefinition.id!);
  } catch (err) {
    logger.error(`Error occurred when queueing build for ${pipelineName}`);
    logger.error(err);
    // rethrow error; and it is caught by caller
    // this is to print more precise error log.
    throw err;
  }
};

/**
 * Install a HLD to Manifest pipeline. The Azure Pipelines yaml should
 * be merged into the HLD repository before this function is to be invoked.
 *
 * @param values Values from command line.
 * @param exitFn Exit function
 */
export const installHldToManifestPipeline = async (
  values: ICommandOptions,
  exitFn: (status: number) => void
) => {
  try {
    const client = await fetchBuildAPIClient(values);
    const buildDefinition = await createPipeline(client, values);
    await buildQueue(
      client,
      values.devopsProject!,
      values.pipelineName!,
      buildDefinition
    );
  } catch (_) {
    exitFn(1);
  }
};

/**
 * Builds and returns variables required for the HLD to Manifest pipeline.
 *
 * @param accessToken Access token with access to the manifest repository.
 * @param buildScriptUrl Build Script URL
 * @param manifestRepoUrl URL to the materialized manifest repository.
 * @returns Object containing the necessary run-time variables for the HLD to Manifest pipeline.
 */
export const requiredPipelineVariables = (
  accessToken: string,
  buildScriptUrl: string,
  manifestRepoUrl: string
): { [key: string]: BuildDefinitionVariable } => {
  return {
    BUILD_SCRIPT_URL: {
      allowOverride: true,
      isSecret: false,
      value: buildScriptUrl
    },
    MANIFEST_REPO: {
      allowOverride: true,
      isSecret: false,
      value: manifestRepoUrl
    },
    PAT: {
      allowOverride: true,
      isSecret: true,
      value: accessToken
    }
  };
};
