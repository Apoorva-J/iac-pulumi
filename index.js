import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import yaml from "js-yaml";
import * as fs from "fs";

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
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
          ipv6CidrBlocks: [config.config["iac-pulumi-01:ipv6_cidr_blocks"]],
        },
        {
          fromPort: config.config["iac-pulumi-01:http_from"], //HTTP
          toPort: config.config["iac-pulumi-01:http_to"],
          protocol: config.config["iac-pulumi-01:protocol"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
          ipv6CidrBlocks: [config.config["iac-pulumi-01:ipv6_cidr_blocks"]],
        },
        {
          fromPort: config.config["iac-pulumi-01:https_from"], //HTTPS
          toPort: config.config["iac-pulumi-01:https_to"],
          protocol: config.config["iac-pulumi-01:protocol"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
          ipv6CidrBlocks: [config.config["iac-pulumi-01:ipv6_cidr_blocks"]],
        },
        {
          fromPort: config.config["iac-pulumi-01:your_from"], // Your application
          toPort: config.config["iac-pulumi-01:your_to"],
          protocol: config.config["iac-pulumi-01:protocol"],
          cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
          ipv6CidrBlocks: [config.config["iac-pulumi-01:ipv6_cidr_blocks"]],
        },
      ],
      egress: [
        {
          fromPort: config.config["iac-pulumi-01:from_port_restricted"], // For MySQL/MariaDB
          toPort: config.config["iac-pulumi-01:to_port_restricted"],
          protocol: config.config["iac-pulumi-01:portal_restricted"],
          // securityGroups: [appSecurityGroup], 
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

  // const instance = new aws.ec2.Instance(
  //   config.config["iac-pulumi-01:instance_tag"],
  //   {
  //     ami: ami.then((i) => i.id),
  //     instanceType: config.config["iac-pulumi-01:instance_type"],
  //     subnetId: publicSubnets[0],
  //     keyName: config.config["iac-pulumi-01:key_value"],
  //     associatePublicIpAddress: true,
  //     vpcSecurityGroupIds: [appSecurityGroup.id],
  //   }
  // );

  // Create a security group for the RDS instance
  const dbSecurityGroup = new aws.ec2.SecurityGroup(config.config["iac-pulumi-01:rds_security_group"], {
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
        // securityGroups: [appSecurityGroup], 
        cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
      },
    ],
    tags: {
      Name: config.config["iac-pulumi-01:rds_security_group"],
    },
  });

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
  const dbSubnetGroup = new aws.rds.SubnetGroup(config.config["iac-pulumi-01:my_db_subnet_group"], {
    subnetIds: privateSubnets.map((subnet) => subnet.id),
    tags: {
      Name: config.config["iac-pulumi-01:my_db_subnet_group"],
    },
  });

  // Create the RDS instance
  const rdsInstance = new aws.rds.Instance(config.config["iac-pulumi-01:rds_instance"], {
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
  });

  rdsInstance.endpoint.apply((endpoint) => {
    //const temp=endpoint.split(':');
    const instance = new aws.ec2.Instance(
      config.config["iac-pulumi-01:instance_tag"],
      {
        ami: ami.then((i) => i.id),
        instanceType: config.config["iac-pulumi-01:instance_type"],
        subnetId: publicSubnets[0],
        keyName: config.config["iac-pulumi-01:key_value"],
        associatePublicIpAddress: config.config["iac-pulumi-01:associatePublicIpAddress"],
        vpcSecurityGroupIds: [appSecurityGroup.id],
        ebsBlockDevices: [
          {
              deviceName: config.config["iac-pulumi-01:EC2_DEVICE_NAME"],
              deleteOnTermination: config.config["iac-pulumi-01:EC2_DELETE_ON_TERMINATION"],
              volumeSize: config.config["iac-pulumi-01:EC2_VOLUME_SIZE"],
              volumeType: config.config["iac-pulumi-01:EC2_VOLUME_TYPE"]
          }
      ],
        userData: pulumi.interpolate`#!/bin/bash
            echo "host=${endpoint}" >> /opt/csye6225/.env
            echo "user=${config.config["iac-pulumi-01:user"]}" >> /opt/csye6225/.env
            echo "password=${config.config["iac-pulumi-01:pd"]}" >> /opt/csye6225/.env
            echo "port=${config.config["iac-pulumi-01:port"]}" >> /opt/csye6225/.env
            echo "dialect=${config.config["iac-pulumi-01:dialect"]}" >> /opt/csye6225/.env
            echo "database=${config.config["iac-pulumi-01:database"]}" >> /opt/csye6225/.env
        `,
      }
    );
  });
});
