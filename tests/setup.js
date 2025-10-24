process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error"; // Reduce log noise during tests

jest.setTimeout(30000);

global.console = {
  ...console,
};
