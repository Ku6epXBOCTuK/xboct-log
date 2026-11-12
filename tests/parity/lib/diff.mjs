function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value) {
	const text = JSON.stringify(value);
	if (text === undefined) return String(value);
	return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function join(path, part) {
	return path === "" ? part : `${path}.${part}`;
}

export function diffJson(expected, actual, path = "", out = []) {
	if (Object.is(expected, actual)) return out;

	if (Array.isArray(expected) && Array.isArray(actual)) {
		if (expected.length !== actual.length) {
			out.push(`${path}: length ${expected.length} != ${actual.length}`);
		}
		for (
			let index = 0;
			index < Math.min(expected.length, actual.length);
			index += 1
		) {
			diffJson(expected[index], actual[index], `${path}[${index}]`, out);
		}
		return out;
	}

	if (isObject(expected) && isObject(actual)) {
		const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
		for (const key of [...keys].sort()) {
			if (!(key in expected)) {
				out.push(`${join(path, key)}: only in actual (${show(actual[key])})`);
			} else if (!(key in actual)) {
				out.push(
					`${join(path, key)}: only in expected (${show(expected[key])})`,
				);
			} else {
				diffJson(expected[key], actual[key], join(path, key), out);
			}
		}
		return out;
	}

	out.push(`${path}: ${show(expected)} != ${show(actual)}`);
	return out;
}
