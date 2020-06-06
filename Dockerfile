FROM node:alpine
ENV NODE_ENV=production
WORKDIR /node
RUN echo 'unsafe-perm = true' > /node/.npmrc
COPY package.json package-lock.json /node/
COPY patches/ /node/patches/
RUN npm install
COPY bot.js twitch.png /node/
CMD npm start
EXPOSE 80
