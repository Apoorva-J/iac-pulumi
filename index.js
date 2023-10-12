import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import env from "dotenv";

env.config();

// VPC
const aws_vpc = new aws.ec2.Vpc("aws_vpc", {
  cidrBlock: process.env.cidrBlock,
  //instanceTenancy: "default",
  tags: {
    Name: "aws_vpc",
  },
});

// Subnets

const publicSubnets = [];
const privateSubnets = [];

const available = aws.getAvailabilityZones({
  state: "available",
});

available.then((available) => {
  const numAvailabilityZones = available.names?.length || 0;

  // Create public and private subnets in the chosen availability zones
  for (let i = 0; i < numAvailabilityZones; i++) {
    // public subnet
    const publicSubnet = new aws.ec2.Subnet(`publicSubnet${i}`, {
      vpcId: aws_vpc.id,
      cidrBlock: pulumi.interpolate`10.0.${i}.0/24`,
      availabilityZone: available.names?.[i],
      mapPublicIpOnLaunch: true,
    });
    publicSubnets.push(publicSubnet);

    // private subnet
    const privateSubnet = new aws.ec2.Subnet(`privateSubnet${i}`, {
      vpcId: aws_vpc.id,
      cidrBlock: pulumi.interpolate`10.0.${i + 10}.0/24`,
      availabilityZone: available.names?.[i],
    });
    privateSubnets.push(privateSubnet);
  }

  // Create an Internet Gateway
  const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
    vpcId: aws_vpc.id,
  });

  // Create a public route table and associate it with public subnets
  const publicRouteTable = new aws.ec2.RouteTable("publicRouteTable", {
    vpcId: aws_vpc.id,
    // routes: [{
    //     cidrBlock: "0.0.0.0/0",
    //     gatewayId: internetGateway.id,
    // }],
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
  });

    // Attach all private subnets to the private route table
    privateSubnets.forEach((subnet, index) => {
        const routeTable = new aws.ec2.RouteTableAssociation(`privateSubnetAssociation${index}`, {
            routeTableId: privateRouteTable.id,
            subnetId: subnet.id,
        });
    });

  // Create a public route in the public route table
  const publicRoute = new aws.ec2.Route("publicRoute", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id,
  });
});
