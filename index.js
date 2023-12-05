import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import yaml from "js-yaml";
import * as fs from "fs";
//need this module for gcp
import gcp from "@pulumi/gcp";

const config = yaml.safeLoad(
  fs.readFileSync(`pulumi.${pulumi.getStack()}.yaml`, "utf8")
);

// VPC
const aws_vpc = new aws.ec2.Vpc(config.config["iac-pulumi-01:aws_vpc"], {
  cidrBlock: config.config["iac-pulumi-01:aws_vpc_cidrBlock"],
  tags: {
    Name: config.config["iac-pulumi-01:aws_vpc"],
  },
});

// Subnets

const publicSubnets = [];
const privateSubnets = [];

const available = aws.getAvailabilityZones({
  state: "available",
});

available.then((available) => {
  const numAvailabilityZones = Math.min(
    available.names?.length,
    parseInt(config.config["iac-pulumi-01:max_subnet_value"])
  );
  const arr = config.config["iac-pulumi-01:sub_cidr"].split(".");
  // Create public and private subnets in the chosen availability zones
  for (let i = 0; i < numAvailabilityZones; i++) {
    const subpubName = config.config["iac-pulumi-01:public_subnet"] + i;
    console.log(subpubName);
    const subpubCidr = arr[0] + "." + arr[1] + "." + i + "." + arr[3];
    // public subnet
    const publicSubnet = new aws.ec2.Subnet(subpubName, {
      vpcId: aws_vpc.id,
      cidrBlock: subpubCidr,
      availabilityZone: available.names?.[i],
      mapPublicIpOnLaunch: true,
      tags: {
        Name: subpubName,
      },
    });
    publicSubnets.push(publicSubnet);

    const host = i + numAvailabilityZones;
    // Create private subnets
    const subpriCidr = arr[0] + "." + arr[1] + "." + host + "." + arr[3];
    const subPrivateName = config.config["iac-pulumi-01:private_subnet"] + i;

    // private subnet
    const privateSubnet = new aws.ec2.Subnet(subPrivateName, {
      vpcId: aws_vpc.id,
      cidrBlock: subpriCidr,
      availabilityZone: available.names?.[i],
      tags: {
        Name: subPrivateName,
      },
    });
    privateSubnets.push(privateSubnet);
  }

  // Create an Internet Gateway
  const internetGateway = new aws.ec2.InternetGateway(
    config.config["iac-pulumi-01:internet_gateway"],
    {
      vpcId: aws_vpc.id,
      tags: {
        Name: config.config["iac-pulumi-01:internet_gateway"],
      },
    }
  );

  // Create a public route table and associate it with public subnets
  const publicRouteTable = new aws.ec2.RouteTable(
    config.config["iac-pulumi-01:public_route_table"],
    {
      vpcId: aws_vpc.id,
      tags: {
        Name: config.config["iac-pulumi-01:public_route_table"],
      },
    }
  );

  publicSubnets.forEach((subnet, index) => {
    let pubAssociationNmae =
      config.config["iac-pulumi-01:public_route_table_association"] + index;
    const routeTable = new aws.ec2.RouteTableAssociation(pubAssociationNmae, {
      routeTableId: publicRouteTable.id,
      subnetId: subnet.id,
    });
  });

  // Create a private route table and associate it with private subnets
  const privateRouteTable = new aws.ec2.RouteTable(
    config.config["iac-pulumi-01:private_route_table"],
    {
      vpcId: aws_vpc.id,
      tags: {
        Name: config.config["iac-pulumi-01:private_route_table"],
      },
    }
  );

  // Attach all private subnets to table the private route table
  privateSubnets.forEach((subnet, index) => {
    let priAssociationNmae =
      config.config["iac-pulumi-01:private_route_table_association"] + index;
    const routeTable = new aws.ec2.RouteTableAssociation(priAssociationNmae, {
      routeTableId: privateRouteTable.id,
      subnetId: subnet.id,
    });
  });

  // Create a public route in the public route table
  const publicRoute = new aws.ec2.Route("publicRoute", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: config.config["iac-pulumi-01:route_to_internet"],
    gatewayId: internetGateway.id,
    tags: {
      Name: config.config["iac-pulumi-01:public_route"],
    },
  });

  // Create Load Balancer Security Group
  const lbSecurityGroup = new aws.ec2.SecurityGroup(
    "loadBalancerSecurityGroup",
    {
      vpcId: aws_vpc.id,
      description: "Security group for the load balancer",
      ingress: [
        // {
        //   fromPort: config.config["iac-pulumi-01:http_from"],
        //   toPort: config.config["iac-pulumi-01:http_from"],
        //   protocol: config.config["iac-pulumi-01:protocol"],
        //   cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
        // },
        {
          fromPort: config.config["iac-pulumi-01:https_from"],
          toPort: config.config["iac-pulumi-01:https_from"],
          protocol: config.config["iac-pulumi-01:protocol"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
        },
      ],
      egress: [
        {
          fromPort: config.config["iac-pulumi-01:from_port_restricted"],
          toPort: config.config["iac-pulumi-01:to_port_restricted"],
          protocol: config.config["iac-pulumi-01:portal_restricted"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
        },
      ],
      tags: {
        Name: "lbSecurityGroup",
      },
    }
  );

  const appSecurityGroup = new aws.ec2.SecurityGroup(
    config.config["iac-pulumi-01:application_security_group"],
    {
      vpcId: aws_vpc.id,
      description: "Security group for web applications",
      ingress: [
        {
          fromPort: config.config["iac-pulumi-01:ssh_from"], //SSH
          toPort: config.config["iac-pulumi-01:ssh_to"],
          protocol: config.config["iac-pulumi-01:protocol"],
          ipv6CidrBlocks: [config.config["iac-pulumi-01:ipv6_cidr_blocks"]],
        },
        {
          fromPort: config.config["iac-pulumi-01:your_from"], // Your application
          toPort: config.config["iac-pulumi-01:your_to"],
          protocol: config.config["iac-pulumi-01:protocol"],
          securityGroups: [lbSecurityGroup.id],
          ipv6CidrBlocks: [config.config["iac-pulumi-01:ipv6_cidr_blocks"]],
        },
      ],
      egress: [
        {
          fromPort: config.config["iac-pulumi-01:from_port_restricted"], // For MySQL/MariaDB
          toPort: config.config["iac-pulumi-01:to_port_restricted"],
          protocol: config.config["iac-pulumi-01:portal_restricted"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
        },
      ],
      tags: {
        Name: config.config["iac-pulumi-01:application_security_group"],
      },
    }
  );

  const ami = aws.ec2.getAmi({
    filters: [
      {
        name: config.config["iac-pulumi-01:ami"],
        values: [config.config["iac-pulumi-01:ami_value"]],
      },
      {
        name: config.config["iac-pulumi-01:root_device_type_tag"],
        values: [config.config["iac-pulumi-01:root_device_type_tag_value"]],
      },
      {
        name: config.config["iac-pulumi-01:virtualization_tag"],
        values: [config.config["iac-pulumi-01:virtualization_tag_value"]],
      },
    ],
    mostRecent: true,
    owners: [config.config["iac-pulumi-01:owner"]],
  });

  // Create a security group for the RDS instance
  const dbSecurityGroup = new aws.ec2.SecurityGroup(
    config.config["iac-pulumi-01:rds_security_group"],
    {
      vpcId: aws_vpc.id,
      description: "Security group for RDS instances",
      ingress: [
        {
          fromPort: config.config["iac-pulumi-01:from_port_sql"], // For MySQL/MariaDB
          toPort: config.config["iac-pulumi-01:to_port_sql"],
          protocol: config.config["iac-pulumi-01:protocol"],
          securityGroups: [appSecurityGroup.id], // Refer to your application's security group
        },
      ],
      egress: [
        {
          fromPort: config.config["iac-pulumi-01:from_port_restricted"], // For MySQL/MariaDB
          toPort: config.config["iac-pulumi-01:to_port_restricted"],
          protocol: config.config["iac-pulumi-01:portal_restricted"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
        },
      ],
      tags: {
        Name: config.config["iac-pulumi-01:rds_security_group"],
      },
    }
  );

  // Create an RDS parameter group
  const dbParameterGroup = new aws.rds.ParameterGroup("db-parameter-group", {
    family: config.config["iac-pulumi-01:family"], // Specify the appropriate family for your database engine and version
    vpcId: aws_vpc.id,
    parameters: [
      {
        name: config.config["iac-pulumi-01:name"],
        value: config.config["iac-pulumi-01:value"],
      },
    ],
  });

  // Create a DB subnet group for RDS instances
  const dbSubnetGroup = new aws.rds.SubnetGroup(
    config.config["iac-pulumi-01:my_db_subnet_group"],
    {
      subnetIds: privateSubnets.map((subnet) => subnet.id),
      tags: {
        Name: config.config["iac-pulumi-01:my_db_subnet_group"],
      },
    }
  );

  // Create the RDS instance
  const rdsInstance = new aws.rds.Instance(
    config.config["iac-pulumi-01:rds_instance"],
    {
      allocatedStorage: config.config["iac-pulumi-01:allocated_storage"],
      storageType: config.config["iac-pulumi-01:storage_type"],
      engine: config.config["iac-pulumi-01:engine"],
      engineVersion: config.config["iac-pulumi-01:engine_version"],
      skipFinalSnapshot: config.config["iac-pulumi-01:skipFinalSnapshot"],
      instanceClass: config.config["iac-pulumi-01:instanceClass"],
      multiAz: config.config["iac-pulumi-01:multiAz"],
      dbName: config.config["iac-pulumi-01:dbName"],
      username: config.config["iac-pulumi-01:username"],
      password: config.config["iac-pulumi-01:password"],
      parameterGroupName: dbParameterGroup.name,
      dbSubnetGroupName: dbSubnetGroup,
      vpcSecurityGroupIds: [dbSecurityGroup.id],
      publiclyAccessible: config.config["iac-pulumi-01:publiclyAccessible"],
    }
  );

  rdsInstance.endpoint.apply((endpoint) => {
    const IAMRole = new aws.iam.Role("IAM", {
      assumeRolePolicy: JSON.stringify({
        Version: config.config["iac-pulumi-01:endpoint_version"],
        Statement: [
          {
            Action: config.config["iac-pulumi-01:action"],
            Effect: config.config["iac-pulumi-01:effect"],
            Principal: {
              Service: config.config["iac-pulumi-01:service"],
            },
          },
        ],
      }),
    });

    const policy = new aws.iam.PolicyAttachment("cloudwatch-agent-policy", {
      policyArn: config.config["iac-pulumi-01:policyArn"],
      roles: [IAMRole.name],
    });

    const roleAttachment = new aws.iam.InstanceProfile("my-instance-profile", {
      role: IAMRole.name,
    });

    const lambdapolicy = new aws.iam.PolicyAttachment("lambda-policy", {
      policyArn: "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
      roles: [IAMRole.name],
    });

    const snsPolicy = new aws.iam.PolicyAttachment("sns-policy", {
      policyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
      roles: [IAMRole.name],
    });

    const dynamodbPolicy = new aws.iam.PolicyAttachment("dynamodb-policy", {
      policyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
      roles: [IAMRole.name],
  });

    // Define your GCP project and zone
    const gcpProject = config.config["iac-pulumi-01:gcp_Project"];
    // const zone = "us-east1";

    // Create a GCP service account
    const serviceAccount = new gcp.serviceaccount.Account("gcpcli", {
      name: "gcpcli",
      accountId: config.config["iac-pulumi-01:service_account_id"],//
      project: gcpProject,
    });

    // // Create a GCP key
    //     const key = new gcp.serviceaccount.Key("gcpkey", {
    //         serviceAccountId: serviceAccount.id,
    //       });

    // Create GCP service account access key
    const serviceAccountKey = new gcp.serviceaccount.Key("gcpkey", {
      name: "gcpkey",
      serviceAccountId: serviceAccount.accountId,
      keyAlgorithm: "KEY_ALG_RSA_2048",
      publicKeyType: "TYPE_X509_PEM_FILE",
      privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
    });

    // Create an SNS topic
    const snsTopic = new aws.sns.Topic("sns-topic", {
      name: "sns-topic",
      // tags: {
      //
      // },
    });

    const ec2Role = new aws.iam.Role("EC2Role", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "ec2.amazonaws.com",
            },
          },
        ],
      }),
    });

    // Attach policy to EC2 SNS role
    const ec2SNSPolicy = new aws.iam.RolePolicy("EC2SNSTopicPolicy", {
      role: ec2Role.id, // Ensure ec2Role is defined
      policy: snsTopic.arn.apply(
        (arn) => pulumi.interpolate`{
     "Version": "2012-10-17",
     "Statement": [
         {
             "Effect": "Allow",
             "Action": "sns:Publish",
             "Resource": "${arn}"
         }
     ]
 }`
      ),
    });

    const policy_sns = new aws.iam.PolicyAttachment("sns_policy_attachment", {
      policyArn: config.config["iac-pulumi-01:policy_sns_arn"],//
      roles: [ec2Role.name],
    });

    // GCS bucket
    const bucket = new gcp.storage.Bucket(
      "csye6225-webapp-pulumi-bucket-name",
      {
        name: config.config["iac-pulumi-01:bucketName"],
        location: "us-east1",
        uniformBucketLevelAccess: true,
        forceDestroy: true,
        project: gcpProject,
        publicAccessPrevention: "enforced",
        versioning: {
          enabled: true,
        },
        storageClass: "STANDARD",
      }
    );

    // // Permission for bucket to service account
    // const objectAdminPermission = new gcp.storage.BucketIAMBinding(
    //   "objectAdminPermission",
    //   {
    //     bucket: bucket.name,
    //     members: [pulumi.interpolate`serviceAccount:${serviceAccount.email}`],
    //     role: "roles/storage.objectAdmin",
    //   }
    // );

    const storageObjectUserRole = "roles/storage.objectUser"; // Replace with the appropriate role

    const binding = new gcp.projects.IAMBinding("storage-object-binding", {
      project: config.config["iac-pulumi-01:gcp_Project"],
      members: [
        serviceAccount.email.apply((email) => `serviceAccount:${email}`),
      ],
      role: storageObjectUserRole,
    });

    // Define the DynamoDB table
    const dynamoDBTable = new aws.dynamodb.Table("dynamodb-table", {
      name: "dynamodbTable",
      attributes: [
        { name: "id", type: "S" },
        { name: "timestamp", type: "S" },
      ],
      billingMode: "PAY_PER_REQUEST",
      hashKey: "id",
      rangeKey: "timestamp",
      tags: {
        Name: "dynamodb-table",
      },
    });

    // Define an IAM role for the Lambda function to consume from SNS
    const lambdaSNSRole = new aws.iam.Role("LambdaSNSRole", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
          },
        ],
      }),
    });

    const lambdaSNSPolicy = new aws.iam.RolePolicy("LambdaSNSTopicPolicy", {
      role: lambdaSNSRole.id,
      policy: snsTopic.arn.apply(
        (arn) => `{
         "Version": "2012-10-17",
         "Statement": [
           {
             "Effect": "Allow",
             "Action": "sns:Subscribe",
             "Resource": "${arn}"
           },
           {
             "Effect": "Allow",
             "Action": [
               "sns:ConfirmSubscription",
               "sns:Receive",
               "sns:Publish"
             ],
             "Resource": "${arn}"
           }
         ]
       }`
      ),
    });

    // Attach the AWSLambdaBasicExecutionRole managed policy to the Lambda role
    const lambdaRolePolicyAttachment = new aws.iam.RolePolicyAttachment(
      "lambdaRolePolicyAttachment",
      {
        role: lambdaSNSRole.name,
        policyArn:
        config.config["iac-pulumi-01:lambdaRolePolicyAttachment_arn"],//
      }
    );


    const lambdaFunctionTest = new aws.lambda.Function("myLambdaFunctionTest", {
      runtime: "nodejs18.x",
      handler: "index.handler",
      role: lambdaSNSRole.arn,
      code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive(
          config.config["iac-pulumi-01:serverlessPath"]
        ),
      }),
      environment: {
        variables: {
            GCS_BUCKET_NAME: bucket.name,
            GCP_SERVICE_ACCOUNT_PVT_KEY: serviceAccountKey.privateKey.apply(encoded => Buffer.from(encoded, 'base64').toString('ascii')),
            EMAIL_API_KEY: config.config["iac-pulumi-01:EMAIL_API_KEY"],
            EMAIL_DOMAIN: config.config["iac-pulumi-01:EMAIL_DOMAIN"],
            DYNAMODB_TABLE_NAME: dynamoDBTable.name,
        },
      },
    });

    // Add SNS trigger to Lambda function
    const lambdaSnsPermission = new aws.lambda.Permission(
      "lambdaSnsPermission",
      {
        action: "lambda:InvokeFunction",
        function: lambdaFunctionTest.arn,
        principal: "sns.amazonaws.com",
        sourceArn: snsTopic.arn,
      }
    );

    // Subscribe Lambda to SNS
    const snsSubscription = new aws.sns.TopicSubscription(
      "lambda-subscription",
      {
        name: "lambda-subscription",
        topic: snsTopic,
        protocol: "lambda",
        endpoint: lambdaFunctionTest.arn,
        tags: {
          Name: "lambda-subscription",
        },
      }
    );

    // Grant PutItem permission on the DynamoDB table to the Lambda role
    const dynamoDBTablePolicy = new aws.iam.RolePolicy("dynamoDBTablePolicy", {
      role: lambdaSNSRole.name,
      policy: dynamoDBTable.arn.apply((arn) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["dynamodb:PutItem"],
              Resource: arn,
            },
          ],
        })
      ),
    });


    snsTopic.arn.apply((SNSarn) => {
      const userDataScript = `#!/bin/bash
            echo "host=${endpoint}" >> /opt/csye6225/.env
            echo "user=${config.config["iac-pulumi-01:user"]}" >> /opt/csye6225/.env
            echo "password=${config.config["iac-pulumi-01:pd"]}" >> /opt/csye6225/.env
            echo "port=${config.config["iac-pulumi-01:port"]}" >> /opt/csye6225/.env
            echo "dialect=${config.config["iac-pulumi-01:dialect"]}" >> /opt/csye6225/.env
            echo "database=${config.config["iac-pulumi-01:database"]}" >> /opt/csye6225/.env
            echo "statsdPort=${config.config["iac-pulumi-01:statsdPort"]}" >> /opt/csye6225/.env
            echo "statsdhost=${config.config["iac-pulumi-01:statsdHost"]}" >> /opt/csye6225/.env
            echo "TopicArn=${SNSarn}" >> /opt/csye6225/.env
            sudo systemctl restart amazon-cloudwatch-agent
        `;

      // Setup Autoscaling for EC2 Instances
      let launchConfiguration = new aws.ec2.LaunchTemplate("asgLaunchConfig", {
        name:"LaunchTemplate",
        imageId: ami.then((i) => i.id),
        instanceType: config.config["iac-pulumi-01:instanceType"],
        keyName: config.config["iac-pulumi-01:key_value"],
        networkInterfaces: [
          {
            associatePublicIpAddress:
              config.config["iac-pulumi-01:associatePublicIpAddress"],
            securityGroups: [appSecurityGroup.id],
          },
        ],
        ebsBlockDevices: [
          {
            deviceName: config.config["iac-pulumi-01:EC2_DEVICE_NAME"],
            deleteOnTermination:
              config.config["iac-pulumi-01:EC2_DELETE_ON_TERMINATION"],
            volumeSize: config.config["iac-pulumi-01:EC2_VOLUME_SIZE"],
            volumeType: config.config["iac-pulumi-01:EC2_VOLUME_TYPE"],
          },
        ],
        iamInstanceProfile: { name: roleAttachment.name },
        userData: Buffer.from(userDataScript).toString("base64"),
      });

      const targetGroup = new aws.lb.TargetGroup("targetgroup", {
        port: config.config["iac-pulumi-01:targetGroupPort"],
        protocol: config.config["iac-pulumi-01:targetGroupProtocol"],
        targetType: config.config["iac-pulumi-01:targetGrouptargetType"],
        vpcId: aws_vpc.id,
        healthCheck: {
          path: config.config["iac-pulumi-01:healthCheckPath"],
          interval: config.config["iac-pulumi-01:healthCheckInterval"],
          timeout: config.config["iac-pulumi-01:healthCheckTimeout"],
          healthyThreshold:
            config.config["iac-pulumi-01:healthCheckHealthyThreshold"],
          unhealthyThreshold:
            config.config["iac-pulumi-01:healthCheckUnhealthyThreshold"],
          matcher: config.config["iac-pulumi-01:healthCheckMatcher"],
        },
      });

      // Auto Scaling Group
      const autoScalingGroup = new aws.autoscaling.Group("myAutoScalingGroup", {
        name:"AutoscalingGroup",
        vpcZoneIdentifiers: publicSubnets,
        minSize: config.config["iac-pulumi-01:autoScalingGroupMin"],
        maxSize: config.config["iac-pulumi-01:autoScalingGroupMax"],
        desiredCapacity: config.config["iac-pulumi-01:desiredCapacity"],
        targetGroupArns: [targetGroup.arn],
        launchTemplate: {
          id: launchConfiguration.id,
          version: "$Latest",
        },
        tags: [
          {
            key: config.config["iac-pulumi:autoscalingGroup_tag_key"],
            value: config.config["iac-pulumi:autoscalingGroup_tag_value"],
            propagateAtLaunch:
              config.config[
                "iac-pulumi:autoscalingGroup_tag_propagateAtLaunch"
              ],
          },
        ],
      });

      // Auto Scaling Policies
      const cpuScalingPolicyUp = new aws.autoscaling.Policy("scaleUpPolicy", {
        scalingAdjustment: config.config["iac-pulumi-01:scalingAdjustment"],
        adjustmentType: config.config["iac-pulumi-01:adjustmentType"],
        cooldown: config.config["iac-pulumi-01:cooldown"],
        policyType: config.config["iac-pulumi-01:policyType"],
        autoscalingGroupName: autoScalingGroup.name,
      });

      const scaleUpCondition = new aws.cloudwatch.MetricAlarm(
        "scaleUpCondition",
        {
          metricName: config.config["iac-pulumi-01:metricName"],
          namespace: config.config["iac-pulumi-01:namespace"],
          statistic: config.config["iac-pulumi-01:statistic"],
          period: config.config["iac-pulumi-01:period"],
          evaluationPeriods: config.config["iac-pulumi-01:evaluationPeriods"],
          comparisonOperator: config.config["iac-pulumi-01:comparisonOperator"],
          dimensions: {
            AutoScalingGroupName: autoScalingGroup.name,
          },
          threshold: config.config["iac-pulumi-01:threshold"],
          alarmActions: [cpuScalingPolicyUp.arn],
        }
      );

      const scaleDown = new aws.autoscaling.Policy("scale_down_policy", {
        cooldown: config.config["iac-pulumi-01:cooldown"],
        scalingAdjustment: config.config["iac-pulumi-01:scalingAdjustmentDown"],
        adjustmentType: config.config["iac-pulumi-01:adjustmentType"],
        policyType: config.config["iac-pulumi-01:policyType"],
        autoscalingGroupName: autoScalingGroup.name,
      });

      const scaleDownCondition = new aws.cloudwatch.MetricAlarm(
        "scaleDownCondition",
        {
          metricName: config.config["iac-pulumi-01:metricName"],
          namespace: config.config["iac-pulumi-01:namespace"],
          statistic: config.config["iac-pulumi-01:statistic"],
          period: config.config["iac-pulumi-01:period"],
          evaluationPeriods:
            config.config["iac-pulumi-01:evaluationPeriodsScaleDown"],
          comparisonOperator:
            config.config["iac-pulumi-01:comparisonOperatorScaleDown"],
          threshold: config.config["iac-pulumi-01:scaleDownThreshold"],
          dimensions: {
            AutoScalingGroupName: autoScalingGroup.name,
          },
          alarmActions: [scaleDown.arn],
        }
      );

      const loadBalancer = new aws.lb.LoadBalancer("webappLoadBalancer", {
        loadBalancerType: config.config["iac-pulumi-01:loadBalancerType"],
        subnets: publicSubnets,
        securityGroups: [lbSecurityGroup.id],
      });

      const listener = new aws.lb.Listener("listener", {
        loadBalancerArn: loadBalancer.arn,
        port: config.config["iac-pulumi-01:newListenerPort"],
        protocol: config.config["iac-pulumi-01:newListenerProtocol"],
        sslPolicy: "ELBSecurityPolicy-2016-08",
        certificateArn: config.config["iac-pulumi-01:certificateArn"],
        defaultActions: [
          {
            type: config.config["iac-pulumi-01:listenerType"],
            targetGroupArn: targetGroup.arn,
          },
        ],
      });

      const hostedZone = aws.route53.getZone({
        name: config.config["iac-pulumi-01:HOSTED_ZONE_NAME"],
      });
      const route53Record = new aws.route53.Record(
        config.config["iac-pulumi-01:RECORD_TAG"],
        {
          name: config.config["iac-pulumi-01:HOSTED_ZONE_NAME"],
          zoneId: hostedZone.then((zone) => zone.zoneId),
          type: config.config["iac-pulumi-01:RECORD_TYPE"],
          aliases: [
            {
              name: loadBalancer.dnsName,
              zoneId: loadBalancer.zoneId,
              evaluateTargetHealth: true,
            },
          ],
        }
      );
    });
  });
});
