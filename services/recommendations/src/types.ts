export interface Product {
    _id: string;
    quantity: number;
    name?: string;
    category?: string | null;
    price?: number | null;
  }
  
  export interface Order {
    _id: string;
    userId: string;
    products: Product[];
  }
  
  export interface OrdersResponse {
    result: Order[];
  }
  
  export interface ProductResponse {
    data: {
      product: {
        _id: string;
        name: string;
        price: number;
        quantity: number;
        category: string;
      };
    };
  }