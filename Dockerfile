FROM node:18.11.0-alpine
ENV NODE_ENV=production
WORKDIR /node
RUN echo 'unsafe-perm = true' > /node/.npmrc
COPY package.json package-lock.json /node/
RUN npm install
COPY twitch.png /node/
ADD src/ /node/src/
CMD npm start
EXPOSE 80
