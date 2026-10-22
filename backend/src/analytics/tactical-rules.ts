// Definitions of the public generator-v2 instruction rules. These describe
// intended targets/directness, not measured execution or causal match impact.
export const tacticalMeanings:Record<string,string>={
 attack:'The simulator moves intended targets forward and prefers more direct passing.',
 protect_lead:'The simulator uses deeper intended targets and less-direct passing.',
 compact:'The simulator uses deeper intended targets; this is an instruction, not a measured compactness statistic.',
 balanced:'The simulator returns to neutral target offsets and baseline passing directness.'
};
