const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

class VideoProcessorService {
  constructor() {
    // Check if ffmpeg is available
    this.checkFFmpegAvailability();
  }

  async checkFFmpegAvailability() {
    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err, _formats) => {
        if (err) {
          console.warn('[VideoProcessor] FFmpeg not available, video processing features will be limited');
          this.ffmpegAvailable = false;
        } else {
          console.log('[VideoProcessor] FFmpeg is available');
          this.ffmpegAvailable = true;
        }
        resolve(this.ffmpegAvailable);
      });
    });
  }

  /**
   * Extract thumbnail from video at specific timestamp
   * @param {string} videoPath - Path to the video file
   * @param {string} outputPath - Path where thumbnail will be saved
   * @param {number} timestamp - Timestamp in seconds (default: 1)
   * @returns {Promise<string>} Path to the generated thumbnail
   */
  async extractThumbnail(videoPath, outputPath, timestamp = 1) {
    if (!this.ffmpegAvailable) {
      throw new Error('FFmpeg is not available for video processing');
    }

    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);

      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(outputPath),
          folder: outputDir,
          size: '1280x720'
        })
        .on('end', () => {
          console.log('[VideoProcessor] Thumbnail extracted successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[VideoProcessor] Error extracting thumbnail:', err);
          reject(err);
        });
    });
  }

  /**
   * Generate multiple thumbnails from video
   * @param {string} videoPath - Path to the video file
   * @param {string} outputDir - Directory where thumbnails will be saved
   * @param {number} count - Number of thumbnails to generate
   * @returns {Promise<string[]>} Array of paths to generated thumbnails
   */
  async generateThumbnails(videoPath, outputDir, count = 3) {
    if (!this.ffmpegAvailable) {
      throw new Error('FFmpeg is not available for video processing');
    }

    return new Promise((resolve, reject) => {
      const thumbnails = [];
      const filename = path.basename(videoPath, path.extname(videoPath));

      ffmpeg(videoPath)
        .screenshots({
          count: count,
          filename: `${filename}-thumb-%i.jpg`,
          folder: outputDir,
          size: '1280x720'
        })
        .on('filenames', (filenames) => {
          filenames.forEach(name => {
            thumbnails.push(path.join(outputDir, name));
          });
        })
        .on('end', () => {
          console.log('[VideoProcessor] Thumbnails generated successfully');
          resolve(thumbnails);
        })
        .on('error', (err) => {
          console.error('[VideoProcessor] Error generating thumbnails:', err);
          reject(err);
        });
    });
  }

  /**
   * Get video metadata
   * @param {string} videoPath - Path to the video file
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoMetadata(videoPath) {
    if (!this.ffmpegAvailable) {
      return {
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'unknown',
        format: 'unknown'
      };
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('[VideoProcessor] Error getting video metadata:', err);
          reject(err);
        } else {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

          resolve({
            duration: metadata.format.duration,
            size: metadata.format.size,
            bitrate: metadata.format.bit_rate,
            format: metadata.format.format_name,
            video: videoStream ? {
              width: videoStream.width,
              height: videoStream.height,
              fps: eval(videoStream.r_frame_rate),
              codec: videoStream.codec_name,
              profile: videoStream.profile
            } : null,
            audio: audioStream ? {
              codec: audioStream.codec_name,
              channels: audioStream.channels,
              sampleRate: audioStream.sample_rate,
              bitrate: audioStream.bit_rate
            } : null
          });
        }
      });
    });
  }

  /**
   * Compress video for web streaming
   * @param {string} inputPath - Path to the input video
   * @param {string} outputPath - Path where compressed video will be saved
   * @param {Object} options - Compression options
   * @returns {Promise<string>} Path to the compressed video
   */
  async compressVideo(inputPath, outputPath, options = {}) {
    if (!this.ffmpegAvailable) {
      // If FFmpeg is not available, just copy the file
      await fs.copyFile(inputPath, outputPath);
      return outputPath;
    }

    const {
      resolution = '1280x720',
      videoBitrate = '1000k',
      audioBitrate = '128k',
      preset = 'fast'
    } = options;

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          `-preset ${preset}`,
          '-crf 23',
          `-b:v ${videoBitrate}`,
          `-b:a ${audioBitrate}`,
          '-movflags +faststart',
          '-pix_fmt yuv420p'
        ])
        .size(resolution)
        .output(outputPath);

      command
        .on('progress', (progress) => {
          console.log(`[VideoProcessor] Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log('[VideoProcessor] Video compression completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[VideoProcessor] Error compressing video:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Convert MOV to MP4 format
   * @param {string} inputPath - Path to the MOV file
   * @param {string} outputPath - Path where MP4 will be saved
   * @returns {Promise<string>} Path to the converted MP4 file
   */
  async convertToMP4(inputPath, outputPath) {
    if (!this.ffmpegAvailable) {
      console.warn('[VideoProcessor] FFmpeg not available, cannot convert MOV to MP4');
      throw new Error('FFmpeg is not available for video conversion');
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-pix_fmt yuv420p' // Ensure compatibility
        ])
        .output(outputPath)
        .on('start', (_commandLine) => {
          console.log('[VideoProcessor] Starting MOV to MP4 conversion');
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[VideoProcessor] Conversion progress: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log('[VideoProcessor] MOV to MP4 conversion completed');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[VideoProcessor] Error converting MOV to MP4:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Convert video to HLS format for adaptive streaming
   * @param {string} inputPath - Path to the input video
   * @param {string} outputDir - Directory where HLS files will be saved
   * @returns {Promise<Object>} HLS manifest and segment paths
   */
  async convertToHLS(inputPath, outputDir) {
    if (!this.ffmpegAvailable) {
      throw new Error('FFmpeg is not available for HLS conversion');
    }

    const filename = path.basename(inputPath, path.extname(inputPath));
    const playlistPath = path.join(outputDir, `${filename}.m3u8`);
    const segmentPattern = path.join(outputDir, `${filename}-%03d.ts`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-preset fast',
          '-crf 23',
          '-f hls',
          '-hls_time 10',
          '-hls_list_size 0',
          '-hls_segment_filename', segmentPattern
        ])
        .output(playlistPath)
        .on('end', () => {
          console.log('[VideoProcessor] HLS conversion completed');
          resolve({
            playlist: playlistPath,
            segmentPattern: segmentPattern
          });
        })
        .on('error', (err) => {
          console.error('[VideoProcessor] Error converting to HLS:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Create video preview (shorter version)
   * @param {string} inputPath - Path to the input video
   * @param {string} outputPath - Path where preview will be saved
   * @param {number} duration - Preview duration in seconds
   * @returns {Promise<string>} Path to the preview video
   */
  async createPreview(inputPath, outputPath, duration = 30) {
    if (!this.ffmpegAvailable) {
      throw new Error('FFmpeg is not available for preview creation');
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(0)
        .setDuration(duration)
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 28',
          '-movflags +faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('[VideoProcessor] Preview created successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[VideoProcessor] Error creating preview:', err);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Process uploaded video (compress, generate thumbnail, get metadata)
   * @param {string} videoPath - Path to the uploaded video
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processUploadedVideo(videoPath, options = {}) {
    const results = {
      original: videoPath,
      metadata: null,
      thumbnail: null,
      compressed: null,
      preview: null
    };

    try {
      // Get video metadata
      if (this.ffmpegAvailable) {
        results.metadata = await this.getVideoMetadata(videoPath);
      }

      const filename = path.basename(videoPath, path.extname(videoPath));
      const dir = path.dirname(videoPath);

      // Generate thumbnail
      if (options.generateThumbnail !== false) {
        const thumbnailPath = path.join(dir, `${filename}-thumb.jpg`);
        try {
          results.thumbnail = await this.extractThumbnail(videoPath, thumbnailPath, 2);
        } catch (err) {
          console.error('[VideoProcessor] Failed to generate thumbnail:', err);
        }
      }

      // Compress video if needed
      if (options.compress && results.metadata) {
        const { video } = results.metadata;
        if (video && (video.width > 1920 || video.height > 1080)) {
          const compressedPath = path.join(dir, `${filename}-compressed.mp4`);
          try {
            results.compressed = await this.compressVideo(videoPath, compressedPath, {
              resolution: '1920x1080',
              videoBitrate: '2000k'
            });
          } catch (err) {
            console.error('[VideoProcessor] Failed to compress video:', err);
          }
        }
      }

      // Create preview if requested
      if (options.createPreview) {
        const previewPath = path.join(dir, `${filename}-preview.mp4`);
        try {
          results.preview = await this.createPreview(videoPath, previewPath, 30);
        } catch (err) {
          console.error('[VideoProcessor] Failed to create preview:', err);
        }
      }

      return results;
    } catch (error) {
      console.error('[VideoProcessor] Error processing video:', error);
      return results;
    }
  }

  /**
   * Optimize image for different sizes
   * @param {string} imagePath - Path to the image
   * @param {string} outputDir - Directory for output images
   * @returns {Promise<Object>} Paths to optimized images
   */
  async optimizeImage(imagePath, outputDir) {
    const filename = path.basename(imagePath, path.extname(imagePath));
    const sizes = {
      thumbnail: { width: 150, height: 150 },
      small: { width: 480, height: 480 },
      medium: { width: 800, height: 800 },
      large: { width: 1920, height: 1920 }
    };

    const results = {};

    for (const [size, dimensions] of Object.entries(sizes)) {
      const outputPath = path.join(outputDir, `${filename}-${size}.jpg`);
      try {
        await sharp(imagePath)
          .resize(dimensions.width, dimensions.height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 85, progressive: true })
          .toFile(outputPath);

        results[size] = outputPath;
      } catch (err) {
        console.error(`[VideoProcessor] Failed to create ${size} image:`, err);
      }
    }

    return results;
  }
}

module.exports = new VideoProcessorService();
