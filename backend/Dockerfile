# Use an official Node.js runtime as a parent image
FROM node:18

# Define build arguments for database credentials
ARG DB_USER
ARG DB_HOST
ARG DB_DATABASE
ARG DB_PASSWORD
ARG DB_PORT

# Set environment variables from build arguments
ENV DB_USER=${DB_USER}
ENV DB_HOST=${DB_HOST}
ENV DB_DATABASE=${DB_DATABASE}
ENV DB_PASSWORD=${DB_PASSWORD}
ENV DB_PORT=${DB_PORT}

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
# The node:18 image already includes build tools

COPY package*.json ./

# Install any needed packages
RUN npm install && npm rebuild bcrypt --build-from-source

# Bundle app source
COPY . .

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Define the command to run the app
# Define the command to run the app
CMD [ "npm", "start" ]
