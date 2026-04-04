# Use an official Node runtime as a parent image
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the communication port (standard for your backend)
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
