import { IntegerFromString } from "$/schema/number";
import { CRLF } from "$/schema/resp/constants";
import { Error_ } from "$/schema/resp/error";
import { LeftoverData } from "$/schema/resp/leftover";
import { ParseResult, Schema, String as Str } from "effect";

export const LeftoverString = LeftoverData(Schema.String);
export const LeftoverError = LeftoverData(Error_);

export const parseIntFromString = ParseResult.decode(IntegerFromString);
export const getCrlfPosition = Str.indexOf(CRLF);
