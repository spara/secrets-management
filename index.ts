import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";


const builderRole = new aws.iam.Role('builder-role', {
    assumeRolePolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'codebuild.amazonaws.com',
          },
          Action: 'sts:AssumeRole',
        },
      ],
    },
  });
  
  // Create a policy for the role
const rolePolicy = new aws.iam.RolePolicy("builder-role-policy", {
    role: builderRole,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: [
                "codebuild:CreateProject"
            ],
            Effect: "Allow",
            Resource: "*"
        },
        {
            Effect: "Allow",
            Action: "iam:PassRole",
            Resource: "*"
        },
        {
            Effect: "Allow",
            Action: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogStreams"
            ],
            Resource: [
                "arn:aws:logs:*:*:*"
            ]
        },
        {
            Effect: "Allow",
            Action: [
                "ssm:GetParameters"
            ],
            Resource: [
                "*"
            ]
        }
    ]
    })
});

// Create policy for the user
const policy = new aws.iam.Policy("mypolicy", {
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: [
                "codebuild:CreateProject"
            ],
            Effect: "Allow",
            Resource: "*"
        }]
    })
});

// Attach user policy to the role
const rolePolicyAttachment = new aws.iam.RolePolicyAttachment("rolepolicyattachment", {
    role: builderRole,
    policyArn: policy.arn,
});

const user = new aws.iam.User("myuser");

const group = new aws.iam.Group("mygroup");

const policyAttachment = new aws.iam.PolicyAttachment("mypolicyattachment", {
    users: [user],
    groups: [group],
    roles: [builderRole],
    policyArn: policy.arn
});

// instance of configuration
const config = new pulumi.Config();

// retrieve the github token as a secret
new aws.codebuild.SourceCredential('github-token', {
  authType: 'PERSONAL_ACCESS_TOKEN',
  serverType: 'GITHUB',
  token: config.requireSecret('github-token'),
});

// Retrieve the Pulumi token as a secret
const pulumiAccessToken = new aws.ssm.Parameter('pulumi-access-token', {
  type: 'String',
  value: config.requireSecret('pulumi-access-token'),
});

const buildProject = new aws.codebuild.Project("aws-codebuild", {
  serviceRole: builderRole.arn,
  source: {
    type: "GITHUB",
    location: "https://github.com/spara/aws-codebuild.git"
  },
  environment: {
    type: "LINUX_CONTAINER",
    computeType: "BUILD_GENERAL1_SMALL",
    image: "aws/codebuild/standard:3.0",
    environmentVariables: [
      {
        type: 'PARAMETER_STORE',
        name: 'PULUMI_ACCESS_TOKEN',
        value: pulumiAccessToken.name,
      },
    ],
  },
  artifacts: { type: "NO_ARTIFACTS" }
});

new aws.codebuild.Webhook('aws-codebuild-webhook', {
    projectName: buildProject.name,
    filterGroups: [
      {
        filters: [
            {
                "type": "EVENT", 
                "pattern": "PUSH"
            },
            {
                "type": "HEAD_REF", 
                "pattern": "refs/heads/master"
            }
        ],
      },
    ],
  });