export interface SocketUser {
  id: number;
  firstName: string;
  photoUrl?: string;
}

export interface SocketData {
  user: SocketUser;
}
