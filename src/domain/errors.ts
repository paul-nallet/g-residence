import { Schema } from 'effect'

export class InvalidInput extends Schema.TaggedError<InvalidInput>()('InvalidInput', { message: Schema.String }) {}
