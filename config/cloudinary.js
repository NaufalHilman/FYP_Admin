const cloudinary = require('cloudinary');
const CloudinaryStorage = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const imageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'arde/careers',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
});

const resumeStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        return {
            folder: 'arde/resumes',
            allowed_formats: ['pdf', 'doc', 'docx'],
            resource_type: 'raw',
        };
    },
});

const memberPhotoStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'arde/members',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
});

const uploadImage = multer({ storage: imageStorage });
const uploadMemberPhoto = multer({ storage: memberPhotoStorage });
const uploadResume = multer({ storage: resumeStorage });

module.exports = { uploadImage, uploadResume, uploadMemberPhoto };