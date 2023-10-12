import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import yaml from "js-yaml";
import * as fs from "fs";


const config = yaml.safeLoad(fs.readFileSync(`pulumi.${pulumi.getStack()}.yaml`, 'utf8'));

// VPC
const aws_vpc = new aws.ec2.Vpc("aws_vpc", {
  cidrBlock: config.config['iac-pulumi-01:cidrBlock'],
    tags: {
        Name: "AWS-VPC",
    },
});

// Subnets

const publicSubnets = [];
const privateSubnets = [];

const available = aws.getAvailabilityZones({
  state: "available",
});

available.then((available) => {
  const numAvailabilityZones = Math.min((available.names?.length || 0),3);

  // Create public and private subnets in the chosen availability zones
  for (let i = 0; i < numAvailabilityZones; i++) {
    // public subnet
    const publicSubnet = new aws.ec2.Subnet(`publicSubnet${i}`, {
      vpcId: aws_vpc.id,
      cidrBlock: pulumi.interpolate`10.0.${i}.0/24`,
      availabilityZone: available.names?.[i],
      mapPublicIpOnLaunch: true,
      tags: {
        Name: "Public Subnet",
    },
    });
    publicSubnets.push(publicSubnet);

    // private subnet
    const privateSubnet = new aws.ec2.Subnet(`privateSubnet${i}`, {
      vpcId: aws_vpc.id,
      cidrBlock: pulumi.interpolate`10.0.${i + 10}.0/24`,
      availabilityZone: available.names?.[i],
      tags: {
        Name: "Private Subnet",
    },
    });
    privateSubnets.push(privateSubnet);
  }

  // Create an Internet Gateway
  const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
    vpcId: aws_vpc.id,
    tags: {
      Name: "Internet Gateway",
  },
  });

  // Create a public route table and associate it with public subnets
  const publicRouteTable = new aws.ec2.RouteTable("publicRouteTable", {
    vpcId: aws_vpc.id,
    tags: {
      Name: "Public Route Table",
  },
  });

  publicSubnets.forEach((subnet, index) => {
    const routeTable = new aws.ec2.RouteTableAssociation(`publicSubnetAssociation${index}`, {
        routeTableId: publicRouteTable.id,
        subnetId: subnet.id,
    });
});


  // Create a private route table and associate it with private subnets
  const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
    vpcId: aws_vpc.id,
    tags: {
      Name:  "Private Route Table",
  },
  });

    // Attach all private subnets to table the private route table
    privateSubnets.forEach((subnet, index) => {
        const routeTable = new aws.ec2.RouteTableAssociation(`privateSubnetAssociation${index}`, {
            routeTableId: privateRouteTable.id,
            subnetId: subnet.id,
        });
    });

  // Create a public route in the public route table
  const publicRoute = new aws.ec2.Route("publicRoute", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: config.config['iac-pulumi-01:destination_cidr'],
    gatewayId: internetGateway.id,
    tags: {
      Name: "Public Route - Destination",
  },
  });
});
