// Mock for pdf-parse module
module.exports = jest.fn().mockResolvedValue({
  numpages: 1,
  numrender: 1,
  info: {
    PDFFormatVersion: '1.4',
    IsAcroFormPresent: false,
    IsXFAPresent: false,
    Title: 'Test PDF',
    Author: 'Test Author',
    Subject: 'Test Subject',
    Keywords: 'test, pdf',
    Creator: 'Test Creator',
    Producer: 'Test Producer',
    CreationDate: 'D:20240101000000Z',
    ModDate: 'D:20240101000000Z'
  },
  metadata: null,
  version: '1.4.0',
  text: 'This is a mock PDF content for testing purposes. It contains sample text that would normally be extracted from a PDF file.'
});
