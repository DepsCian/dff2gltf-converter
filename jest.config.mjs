/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  preset: 'ts-jest',
  testEnvironment: "node",
  verbose: true,
  clearMocks: true,
  roots: ["./tests"],
  transform: {},
  moduleFileExtensions: ['js', 'ts'],
};

export default config;
