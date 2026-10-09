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

/**
 * The one character standing in for a subject that has no cover. A subject is
 * often named after its grade level ("四年级数学 Year 4 Mathematics" in
 * "四年级 Year 4"), and then every subject of a grade would begin alike, so
 * the words the two names begin with in common are passed over first.
 */
export function subjectInitial(name: string, gradeName: string): string {
	const subject = name.trim();
	const words = gradeName.trim().split(/\s+/);

	// The longest run of the grade level's leading words that the subject's name starts with.
	let shared = '';
	for (let count = 1; count <= words.length; count++) {
		const lead = words.slice(0, count).join(' ');
		if (!lead || !subject.startsWith(lead)) break;
		// "Year" is not the start of "Yearbook": a word that carries on is not the grade's.
		const carriesOn =
			/[a-z0-9]/i.test(lead.at(-1) ?? '') && /[a-z0-9]/i.test(subject[lead.length] ?? '');
		if (!carriesOn) shared = lead;
	}

	const [first] = Array.from(subject.slice(shared.length).trim() || subject);
	return first?.toUpperCase() ?? '?';
}
