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
  const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup", {
    vpcId: aws_vpc.id,
    description: "Security group for RDS instances",
    ingress: [
      {
        fromPort: "3306", // For MySQL/MariaDB
        toPort: "3306",
        protocol: "tcp",
        securityGroups: [appSecurityGroup.id], // Refer to your application's security group
      },
    ],
    egress: [
      {
        fromPort: "0", // For MySQL/MariaDB
        toPort: "0",
        protocol: "-1",
        securityGroups: [appSecurityGroup.id], // Refer to your application's security group
        cidrBlocks: [config.config["iac-pulumi-01:cidr_blocks"]],
      },
    ],
    tags: {
      Name: "RDS Security Group",
    },
  });

  // Create an RDS parameter group
  const dbParameterGroup = new aws.rds.ParameterGroup("db-parameter-group", {
    family: "mysql8.0", // Specify the appropriate family for your database engine and version
    vpcId: aws_vpc.id,
    parameters: [
      {
        name: "character_set_server",
        value: "utf8",
      },
    ],
  });

  // Create a DB subnet group for RDS instances
  const dbSubnetGroup = new aws.rds.SubnetGroup("mydbsubnetgroup", {
    subnetIds: privateSubnets.map((subnet) => subnet.id),
    tags: {
      Name: "mydbsubnetgroup",
    },
  });

  // Create the RDS instance
  const rdsInstance = new aws.rds.Instance("rds-instance", {
    allocatedStorage: 20,
    storageType: "gp2",
    engine: "mysql",
    engineVersion: "8.0",
    skipFinalSnapshot: true,
    instanceClass: "db.t2.micro",
    multiAz: false,
    dbName: "assignment1_db",
    username: "root",
    password: "Planet12345",
    parameterGroupName: dbParameterGroup.name,
    dbSubnetGroupName: dbSubnetGroup,
    vpcSecurityGroupIds: [dbSecurityGroup.id, appSecurityGroup.id],
    publiclyAccessible: false,
  });

  rdsInstance.endpoint.apply((endpoint) => {
    const instance = new aws.ec2.Instance(
      config.config["iac-pulumi-01:instance_tag"],
      {
        ami: ami.then((i) => i.id),
        instanceType: config.config["iac-pulumi-01:instance_type"],
        subnetId: publicSubnets[0],
        keyName: config.config["iac-pulumi-01:key_value"],
        associatePublicIpAddress: true,
        vpcSecurityGroupIds: [appSecurityGroup.id, dbSecurityGroup.id],
        userData: pulumi.interpolate`#!/bin/bash
            echo "host=${endpoint}" >> /home/admin/opt/webapp/.env
            echo "user=${config.config["iac-pulumi-01:user"]}" >> /home/admin/opt/webapp/.env
            echo "password=${config.config["iac-pulumi-01:pd"]}" >> /home/admin/opt/webapp/.env
            echo "port=${config.config["iac-pulumi-01:port"]}" >> /home/admin/opt/webapp/.env
            echo "dialect=${config.config["iac-pulumi-01:dialect"]}" >> /home/admin/opt/webapp/.env
            echo "database=${config.config["iac-pulumi-01:database"]}" >> /home/admin/opt/webapp/.env
        `,
      }
    );
  });
});
