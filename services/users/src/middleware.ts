import { sign, verify } from 'jsonwebtoken';

const signJWT = (userId: string) => {
    if (!process.env.API_SECRET) {
        throw new Error('API_SECRET is not defined');
    }
    return sign({ userId }, process.env.API_SECRET);
}

const verifyJWT = (token: string) => {
    if (!process.env.API_SECRET) {
        throw new Error('API_SECRET is not defined');
    }
    return verify(token, process.env.API_SECRET) as { userId: string };
}

export { signJWT, verifyJWT };