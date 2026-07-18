using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Meezane.Delivery
{
    public sealed class PixelComparison
    {
        public int ExpectedWidth { get; set; }
        public int ExpectedHeight { get; set; }
        public int ActualWidth { get; set; }
        public int ActualHeight { get; set; }
        public long PixelCount { get; set; }
        public long ExactDifferentPixels { get; set; }
        public long SignificantDifferentPixels { get; set; }
        public double AverageRgbaDelta { get; set; }
        public int MaxRgbaDelta { get; set; }
        public int DifferenceLeft { get; set; }
        public int DifferenceTop { get; set; }
        public int DifferenceRight { get; set; }
        public int DifferenceBottom { get; set; }
    }

    public static class StrictImageComparer
    {
        public static PixelComparison Compare(string expectedPath, string actualPath, int significantDelta)
        {
            using (var expectedSource = new Bitmap(expectedPath))
            using (var actualSource = new Bitmap(actualPath))
            {
                var result = new PixelComparison
                {
                    ExpectedWidth = expectedSource.Width,
                    ExpectedHeight = expectedSource.Height,
                    ActualWidth = actualSource.Width,
                    ActualHeight = actualSource.Height,
                    DifferenceLeft = -1,
                    DifferenceTop = -1,
                    DifferenceRight = -1,
                    DifferenceBottom = -1,
                };

                if (expectedSource.Width != actualSource.Width || expectedSource.Height != actualSource.Height)
                {
                    return result;
                }

                var rectangle = new Rectangle(0, 0, expectedSource.Width, expectedSource.Height);
                using (var expected = expectedSource.Clone(rectangle, PixelFormat.Format32bppArgb))
                using (var actual = actualSource.Clone(rectangle, PixelFormat.Format32bppArgb))
                {
                    var expectedData = expected.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                    var actualData = actual.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                    try
                    {
                        var rowLength = expected.Width * 4;
                        var expectedRow = new byte[rowLength];
                        var actualRow = new byte[rowLength];
                        long totalDelta = 0;
                        result.PixelCount = (long)expected.Width * expected.Height;

                        for (var y = 0; y < expected.Height; y++)
                        {
                            Marshal.Copy(IntPtr.Add(expectedData.Scan0, y * expectedData.Stride), expectedRow, 0, rowLength);
                            Marshal.Copy(IntPtr.Add(actualData.Scan0, y * actualData.Stride), actualRow, 0, rowLength);

                            for (var x = 0; x < expected.Width; x++)
                            {
                                var offset = x * 4;
                                var delta =
                                    Math.Abs(expectedRow[offset] - actualRow[offset]) +
                                    Math.Abs(expectedRow[offset + 1] - actualRow[offset + 1]) +
                                    Math.Abs(expectedRow[offset + 2] - actualRow[offset + 2]) +
                                    Math.Abs(expectedRow[offset + 3] - actualRow[offset + 3]);

                                totalDelta += delta;
                                if (delta == 0) continue;

                                result.ExactDifferentPixels++;
                                if (delta > result.MaxRgbaDelta) result.MaxRgbaDelta = delta;
                                if (delta <= significantDelta) continue;

                                result.SignificantDifferentPixels++;
                                if (result.DifferenceLeft < 0 || x < result.DifferenceLeft) result.DifferenceLeft = x;
                                if (result.DifferenceTop < 0 || y < result.DifferenceTop) result.DifferenceTop = y;
                                if (x > result.DifferenceRight) result.DifferenceRight = x;
                                if (y > result.DifferenceBottom) result.DifferenceBottom = y;
                            }
                        }

                        result.AverageRgbaDelta = result.PixelCount == 0 ? 0 : totalDelta / (double)result.PixelCount;
                    }
                    finally
                    {
                        expected.UnlockBits(expectedData);
                        actual.UnlockBits(actualData);
                    }
                }

                return result;
            }
        }
    }
}
