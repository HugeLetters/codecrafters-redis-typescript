export type StrictOmit<T, K extends keyof T> = Omit<T, K>;

export type Satisfies<T extends U, U> = T;
