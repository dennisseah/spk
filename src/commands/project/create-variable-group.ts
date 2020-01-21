import { VariableGroup } from "azure-devops-node-api/interfaces/ReleaseInterfaces";
import commander from "commander";
import path from "path";
import { echo } from "shelljs";
import { Bedrock, Config, write } from "../../config";
import {
  build as buildCmd,
  validateForRequiredValues
} from "../../lib/commandBuilder";
import { IAzureDevOpsOpts } from "../../lib/git";
import { addVariableGroup } from "../../lib/pipelines/variableGroup";
import { hasValue } from "../../lib/validator";
import { logger } from "../../logger";
import {
  IBedrockFile,
  IVariableGroupData,
  IVariableGroupDataVariable
} from "../../types";
import decorator from "./create-variable-group.decorator.json";

// values that we need to pull out from command operator
interface ICommandOptions {
  [key: string]: string | undefined;
}

const fetchValues = async (opts: ICommandOptions): Promise<ICommandOptions> => {
  const { azure_devops } = Config();

  const {
    registryName,
    servicePrincipalId,
    servicePrincipalPassword,
    tenant,
    hldRepoUrl = azure_devops && azure_devops.hld_repository,
    orgName = azure_devops && azure_devops.org,
    personalAccessToken = azure_devops && azure_devops.access_token,
    project = azure_devops && azure_devops.project
  } = opts;

  return {
    hldRepoUrl,
    orgName,
    personalAccessToken,
    project,
    registryName,
    servicePrincipalId,
    servicePrincipalPassword,
    tenant
  };
};

export const validateValues = (values: ICommandOptions): string[] => {
  return validateForRequiredValues(decorator, values);
};

/**
 * Executes the command.
 *
 * @param variableGroupName Variable Group Name
 * @param opts Option object from command
 */
const execute = async (variableGroupName: string, opts: ICommandOptions) => {
  try {
    const values = await fetchValues(opts);
    const errors = validateValues(values);
    if (errors.length !== 0) {
      process.exit(1);
    }

    const accessOpts: IAzureDevOpsOpts = {
      orgName: values.orgName,
      personalAccessToken: values.personalAccessToken,
      project: values.project
    };

    logger.debug(`access options: ${JSON.stringify(accessOpts)}`);

    const variableGroup = await create(variableGroupName, values, accessOpts);

    // set the variable group name
    const projectPath = process.cwd();
    await setVariableGroupInBedrockFile(projectPath, variableGroup.name!);

    // print newly created variable group
    echo(JSON.stringify(variableGroup, null, 2));

    logger.info(
      "Successfully created a variable group in Azure DevOps project!"
    );
    process.exit(0);
  } catch (err) {
    logger.error(`Error occurred while creating variable group`);
    logger.error(err);
    process.exit(1);
  }
};

/**
 * Adds the create command to the variable-group command object
 *
 * @param command Commander command object to decorate
 */
export const commandDecorator = (command: commander.Command): void => {
  buildCmd(command, decorator).action(execute);
};

/**
 * Creates a Azure DevOps variable group
 *
 * @param variableGroupName The Azure DevOps varible group name
 * @param values value from Command line.
 * @param accessOpts Azure DevOps access options from command options to override spk config
 */
export const create = async (
  variableGroupName: string,
  values: ICommandOptions,
  accessOpts: IAzureDevOpsOpts
): Promise<VariableGroup> => {
  logger.info(
    `Creating Variable Group from group definition '${variableGroupName}'`
  );
  try {
    const vars: IVariableGroupDataVariable = {
      ACR_NAME: {
        value: values.registryName
      },
      HLD_REPO: {
        value: values.hldRepoUrl
      },
      PAT: {
        isSecret: true,
        value: accessOpts.personalAccessToken
      },
      SP_APP_ID: {
        isSecret: true,
        value: values.servicePrincipalId
      },
      SP_PASS: {
        isSecret: true,
        value: values.servicePrincipalPassword
      },
      SP_TENANT: {
        isSecret: true,
        value: values.tenantId
      }
    };
    const variableGroupData: IVariableGroupData = {
      description: "Created from spk CLI",
      name: variableGroupName,
      type: "Vsts",
      variables: [vars]
    };

    return await addVariableGroup(variableGroupData, accessOpts);
  } catch (err) {
    throw err; // TOFIX: are we just rethrowing error?
  }
};

/**
 * Writes the variable group name in a default bedrock.yaml
 *
 * @param rootProjectPath Path to generate/update the the bedrock.yaml file in
 * @param variableGroupName The varible group name
 */
export const setVariableGroupInBedrockFile = async (
  rootProjectPath: string,
  variableGroupName: string
) => {
  if (!hasValue(rootProjectPath)) {
    throw new Error("Project root path is not valid");
  }
  if (!hasValue(variableGroupName)) {
    throw new Error("Variable Group Name is not valid");
  }

  const absProjectRoot = path.resolve(rootProjectPath);
  logger.info(`Creating variable group ${variableGroupName}`);

  let bedrockFile: IBedrockFile | undefined;

  // Get bedrock.yaml if it already exists
  try {
    bedrockFile = Bedrock(rootProjectPath);
  } catch (err) {
    logger.info(
      `No bedrock.yaml found at ${absProjectRoot}, creating a new file to add variable group`
    );
    bedrockFile = {
      rings: {}, // rings is optional but necessary to create a bedrock file in config.write method
      services: {} // service property is not optional so set it to null
    };
  }

  // to be sure that variableGroups is not undefined.
  bedrockFile.variableGroups = bedrockFile.variableGroups || [];
  // add new variabe group
  bedrockFile.variableGroups.push(variableGroupName);

  write(bedrockFile, absProjectRoot);
};
