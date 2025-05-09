import { IntegerFromString } from "$/schema/number";
import { CRLF } from "$/schema/resp/constants";
import { LeftoverData } from "$/schema/resp/leftover";
import { ParseResult, Schema, String as Str } from "effect";

export const LeftoverString = LeftoverData(Schema.String);

export const parseIntFromString = ParseResult.decode(IntegerFromString);
export const getCrlfPosition = Str.indexOf(CRLF);
