/** Up to two letters standing in for a person where there is no picture. */
export function initials(name: string): string {
	return (
		name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.toUpperCase()
			.slice(0, 2) || '?'
	);
}
