type PluralMapper = {
	zero?: string;
	one: string;
	two?: string;
	few?: string;
	many: string;
	other?: string;
};
const PluralRule = new Intl.PluralRules("en");

export function createPluralizer(mapper: PluralMapper) {
	return function (count: number): string {
		const s = PluralRule.select(count);

		switch (s) {
			case "zero":
				return mapper.zero ?? mapper.few ?? mapper.two ?? mapper.many;
			case "one":
				return mapper.one;
			case "two":
				return mapper.two ?? mapper.few ?? mapper.many;
			case "few":
				return mapper.few ?? mapper.many;
			case "many":
				return mapper.many;
			case "other":
				return mapper.other ?? mapper.many;
		}
	};
}
