import { config } from 'dotenv';
import mongoose from 'mongoose';

import app from './app';

config();

const main = async () => {
    const mongoUrl = process.env["MONGO_URL"];
    if (!mongoUrl) {
        throw new Error("MONGO_URL is not defined in the environment variables");
    }
    await mongoose.connect(mongoUrl);
}

main().then(() => {
    app.listen(process.env['USER_SERVICE_PORT'], () => {
        console.log(`Server is running on port ${process.env['USER_SERVICE_PORT']}`);
    });
}).catch(async (err) => {
    console.error(err);
    process.exit(1);
});