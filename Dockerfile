# Use an official Node runtime as a parent image
FROM node:22-alpine

# Install postgresql-client for backup and restore
RUN apk add --no-cache postgresql-client

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install project dependencies with speed optimizations
RUN npm config set fetch-retry-maxtimeout 600000 && \
    npm config set fetch-retries 5 && \
    npm install --omit=dev --no-audit --no-fund

# Copy the rest of the application code
COPY . .

# Expose the communication port (standard for your backend)
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
