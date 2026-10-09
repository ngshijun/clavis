/** The part of saxen, a streaming XML parser, that the workbook reader uses. It ships no types. */
declare module 'saxen' {
	type Decode = (text: string) => string;

	export class Parser {
		on(
			event: 'openTag',
			handler: (
				name: string,
				attributes: () => Record<string, string>,
				decode: Decode,
				selfClosing: boolean
			) => void
		): this;
		on(
			event: 'closeTag',
			handler: (name: string, decode: Decode, selfClosing: boolean) => void
		): this;
		on(event: 'text', handler: (text: string, decode: Decode) => void): this;
		/** Throws for XML it cannot read. */
		parse(xml: string): this;
	}
}
