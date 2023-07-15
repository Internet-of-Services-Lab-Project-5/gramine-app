FROM iexechub/iexec-gramine-base:0.10.0

RUN apt-get update \
    && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_14.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

ARG SOURCE_DIR=src
ARG GRAMINE_DIR=gramine

# Get the code of app to /workplace/app
COPY $SOURCE_DIR/app.js /workplace/app
COPY ./package.json /workplace/app

# Set the main function for node app, no need for binnary app
RUN sed -i "s#MAIN_FUNC=#MAIN_FUNC=/workplace/app/app.js#" /apploader.sh

WORKDIR /workplace/app

# Install required node dependencies (needs to be ran after WORKDIR has been specified)
RUN npm install iexec ethers fs adm-zip

# Copy the manifest to use from within the base image
# or create your own
RUN cp /common-manifests/nodejs.entrypoint.manifest /entrypoint.manifest

# Finalize app (finalize manifest and sign app)
RUN /finalize-app.sh