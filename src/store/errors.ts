export class NotFound extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFound';
  }
}

export class ExpiredUndo extends Error {
  constructor(message = 'undo expired') {
    super(message);
    this.name = 'ExpiredUndo';
  }
}
