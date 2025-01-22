// export interface IProduct {
//     _id: string;
//     name: string;
//     price: number;
//     quantity: number;
// }
  
// export interface ICreateProductInput {
//     name: string;
//     price: number;
// 	quantity: number;
// }
  
// export interface IUpdateProductInput {
//     id: string;
//     name: string;
//     price: number;
// }

// export interface IOrderProduct {
//     _id: string;
//     quantity: number;
// }
  
// export interface IOrder {
//     _id: string;
//     userId: string;
//     products: IOrderProduct[];
// }
  
// export interface ICreateOrderInput {
//     _id: string;
//     price: number;
//     quantity: number;
// }

export interface IUser {
	_id: string;
	email: string;
	password: string;
}
  
export interface IRegisterUserInput {
	email: string;
	password: string;
}
  
export interface IRegisterUserResult {
	access_token: string;
	user: IUser;
}