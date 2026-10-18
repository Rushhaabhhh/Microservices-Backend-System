FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json ./

COPY yarn.lock ./

RUN yarn

COPY . .

RUN chown -R node:node /usr/src/app
USER node

ENV PORT=4000

EXPOSE $PORT

CMD ["yarn", "start"]