# Build layer -----------------------------------------------------------------
FROM node:lts AS build

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --include=dev

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# App layer -------------------------------------------------------------------
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install prod dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app
COPY --from=build /app/build ./

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["node", "index.js"]